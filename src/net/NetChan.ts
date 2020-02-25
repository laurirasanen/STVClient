import { Socket, createSocket } from "dgram";
import * as lsjz from "lzjs";
import * as CRC32 from "crc-32";
import { MessageHandler } from "./MessageHandler";
import { logWithTime, errorWithTime, padNumber } from "../Util";
import { BinaryWriter } from "../BinaryWriter";
import { BinaryReader, SeekOrigin } from "../BinaryReader";
import { NetPacket, DataFragment, SubChannel } from "./Structures";
// TODO: clean up these imports
import {
    CONNECTIONLESS_HEADER,
    S2C_CHALLENGE,
    A2S_GETCHALLENGE,
    C2S_CONNECT,
    PROTOCOL_VERSION,
    GAME_VERSION_TF,
    CD_KEY,
    PROTOCOL_STEAM,
    SIGNONSTATE_NONE,
    SIGNONSTATE_CHALLENGE,
    SIGNONSTATE_CONNECTED,
    SIGNONSTATE_NEW,
    SIGNONSTATE_PRESPAWN,
    SIGNONSTATE_SPAWN,
    SIGNONSTATE_FULL,
    SIGNONSTATE_CHANGELEVEL,
    PROTOCOL_HASHEDCDKEY,
    STEAM_KEYSIZE, S2C_CONNREJECT,
    S2C_CONNECTION,
    PACKET_FLAG_CHOKED,
    PACKET_FLAG_RELIABLE,
    PACKET_FLAG_COMPRESSED,
    PACKET_FLAG_ENCRYPTED,
    PACKET_FLAG_SPLIT,
    MAX_SUBCHANNELS,
    MAX_STREAMS,
    NETMSG_TYPE_BITS,
    net_NOP,
    NET_MAX_DATAGRAM_PAYLOAD,
    DECODE_PAD_BITS,
    MIN_ROUTABLE_PAYLOAD,
    MAX_FILE_SIZE_BITS,
    FRAGMENT_BITS,
    FRAGMENT_SIZE,
    NET_MAX_PALYLOAD_BITS,
    BYTES2FRAGMENTS,
    SUBCHANNEL_FREE,
    SUBCHANNEL_DIRTY,
    SUBCHANNEL_WAITING,
    SUBCHANNEL_TOSEND,
    FLIPBIT,
    ENCODE_PAD_BITS,
    GetBitForBitNum
} from "./Protocol";
import { NetMessage, CLC_Move, NET_SetConvar } from "./NetMessage";

export class NetChan {
    private game: string = "tf";
    private socket: Socket;
    private maxReliablePayloadSize: number;
    private address: string;
    private port: number;
    private connectTime: number;
    private rate: number;
    private clearTime: number;
    private messageHandler: MessageHandler;
    private timeOut: number;
    private challengeNr: BigInt;
    private nextCmdTime: number;
    private shouldChecksumPackets: boolean = true;

    private receiveList: Array<DataFragment>;
    private waitingList: Array<Array<DataFragment>>;
    private subChannels: Array<SubChannel>;

    public hostFrameTime: number;
    public hostFrameTimeStdDeviation: number;

    state: number;
    password: string;
    name: string;
    inSequenceNr: number = -1;
    outSequenceNrAck: number = -1;
    droppedPackets: number = 0;
    lastReceived: number = 0;
    inReliableState: number = 0;
    outReliableState: number = 0;

    constructor(name: string, game: string) {
        logWithTime(`STVClient.Net.NetChan()`);

        if (!["tf", "csgo"].includes(game)) {
            throw (`Unrecognized game ${game}`);
        }
        this.game = game;

        this.receiveList = new Array<DataFragment>(MAX_STREAMS);
        this.waitingList = new Array<Array<DataFragment>>(MAX_STREAMS);
        for (let i = 0; i < MAX_STREAMS; i++) {
            this.receiveList[i] = new DataFragment();
            this.waitingList[i] = new Array<DataFragment>();
        }
        this.subChannels = new Array<SubChannel>();
        for (let i = 0; i < MAX_SUBCHANNELS; i++) {
            this.subChannels[i] = new SubChannel(i);
        }

        this.messageHandler = new MessageHandler(this);

        this.rate = 0.03;
        this.timeOut = 30;

        this.name = name;
        this.state = SIGNONSTATE_NONE;
    }

    connect = (address: string, password: string, bindPort: number = 27005) => {
        logWithTime(`NetChan.connect()`);

        this.address = address.split(":")[0];
        this.port = parseInt(address.split(":")[1]);
        this.password = password;

        this.socket = createSocket("udp4");
        this.socket.bind(bindPort, "192.168.1.99");
        this.socket.on("connect", this.onConnect);
        this.socket.on("close", this.onClose);
        this.socket.on("error", this.onError);
        this.socket.on("message", this.onMessage);
        this.socket.connect(this.port, this.address);
    }

    shutdown = () => {
        try {
            this.socket.disconnect();
        } catch (error) {
            // no-op
        }
        this.socket.close();
    }

    onConnect = () => {
        logWithTime("STVClient.Net.NetChan.onConnect()");

        if (this.state == SIGNONSTATE_NONE) {
            this.state = SIGNONSTATE_CHALLENGE;
            this.sendChallengePacket();
        } else {
            errorWithTime(`STVClient.Net.NetChan.onConnect() called with state ${this.state}`);
        }
    }

    onClose = () => {
        logWithTime("STVClient.Net.NetChan.onClose()");
    }

    onError = (error: Error) => {
        logWithTime("STVClient.Net.NetChan.onError()");
        console.log(error);
    }

    onMessage = (msg: Buffer, rinfo) => {
        if (rinfo.address !== this.address) return;
        if (rinfo.port !== this.port) return;

        logWithTime(`STVClient.Net.NetChan.onMessage(): Received ${rinfo.size} bytes from ${rinfo.address}:${rinfo.port}`);
        this.handleMessage(msg, rinfo);
    }

    send = (data: Buffer | string, compress: boolean = false) => {
        if (compress) {
            throw ("not tested");

            // LZSS
            var compressed: string = lsjz.compress(data);
            var compressedBuffer = Buffer.from(compressed);

            var outData = Buffer.alloc(compressedBuffer.length + 1);
            outData.writeUInt8(PACKET_FLAG_COMPRESSED, 0);
            compressedBuffer.copy(outData, 1, 0, compressedBuffer.length);

            if (outData.byteLength > NET_MAX_DATAGRAM_PAYLOAD) {
                errorWithTime(`STVClient.Net.NetChan.send(): Payload exceeds max size (${outData.byteLength} > ${NET_MAX_DATAGRAM_PAYLOAD})`);
                return;
            }

            this.socket.send(outData);
        } else {
            this.socket.send(data);
        }
    }

    sendEmptyAck() {
        this.sendNetMessage(new NetMessage());
    }

    sendNetMessage(message: NetMessage) {
        var writer = new BinaryWriter();
        writer.writeUint32(this.outSequenceNrAck);
        writer.writeUint32(this.inSequenceNr + 1);
        var flagPos = writer.getOffset();
        var flags = 0;
        writer.writeUint8(0);   // write correct flags later
        writer.writeUint16(0);  // write correct checksum later
        var checkSumStart = writer.getOffset();
        writer.writeUint8(this.inReliableState);

        // choked packets?
        // send subchannel?

        message.writeToBuffer(writer);

        // Deal with packets that are too small for some networks
        while (writer.getSize() < MIN_ROUTABLE_PAYLOAD) {
            // Go ahead and pad some bits as long as needed
            writer.writeBitsUint(net_NOP, NETMSG_TYPE_BITS);
        }

        // Make sure we have enough bits to read a final net_NOP opcode before compressing
        var remainingBits = writer.getOffset() % 8;
        if (remainingBits > 0 && remainingBits <= (8 - NETMSG_TYPE_BITS)) {
            writer.writeBitsUint(net_NOP, NETMSG_TYPE_BITS);
        }

        // Now round up to byte boundary
        remainingBits = writer.getOffset() % 8;
        if (remainingBits > 0) {
            var padBits = 8 - remainingBits;
            flags |= ENCODE_PAD_BITS(padBits);

            // pad with ones
            if (padBits > 0) {
                var ones = GetBitForBitNum(padBits) - 1;
                writer.writeBitsUint(ones, padBits);
            }
        }

        // write correct flags
        writer.seek(flagPos, SeekOrigin.Begin);
        writer.writeUint8(flags);

        // write checksum
        if (this.shouldChecksumPackets) {
            if (writer.getOffset() % 8) {
                throw (`NetChan.sendNetMessage(): not aligned to byte for checksum`);
            }

            var checkSumBytes = writer.getSize() - checkSumStart / 8;
            var buff = Buffer.alloc(checkSumBytes);
            writer.copy(buff, checkSumStart / 8);
            var checkSum = this.bufferToCheckSum(buff);
            writer.seek(flagPos + 8, SeekOrigin.Begin);
            writer.writeUint16(checkSum);
        }

        this.socket.send(writer.getBuffer());
    }

    sendChallengePacket() {
        logWithTime(`STVClient.net.NetChan.sendChallengePacket()`);
        var writer = new BinaryWriter();
        writer.writeUint32(CONNECTIONLESS_HEADER);
        writer.writeUint8(A2S_GETCHALLENGE);
        // pad to 16 bytes
        writer.writeString("000000000");

        this.send(writer.getBuffer());
    }

    sendConnectPacket(challengeNr: BigInt, authProtocol: number, keySize: number, encryptionKey: Array<number>, steamId: BigInt, secure: boolean, name: string, password: string) {
        logWithTime(`STVClient.net.NetChan.sendConnectPacket()`);

        var writer = new BinaryWriter();

        writer.writeUint32(CONNECTIONLESS_HEADER);
        writer.writeUint8(C2S_CONNECT);
        writer.writeUint32(PROTOCOL_VERSION);
        writer.writeUint32(authProtocol);
        writer.writeUint64(challengeNr);
        writer.writeString(name);
        writer.writeString(password);
        if (this.game == "tf") {
            writer.writeString(GAME_VERSION_TF.toString());
        }

        switch (authProtocol) {
            case PROTOCOL_HASHEDCDKEY:
                writer.writeString(CD_KEY);
                break;

            default:
                errorWithTime(`STVClient.net.NetChan.sendConnectPacket(): Trying to send connection packet with unhandled auth protocol ${authProtocol}`);
                return;
        }

        // Mark time of this attempt for retransmit requests
        this.connectTime = Date.now();

        this.challengeNr = challengeNr;

        this.send(writer.getBuffer());
    }

    handleMessage = (msg: Buffer, rinfo) => {
        var packet = new NetPacket();
        packet.received = Date.now();
        packet.wireSize = msg.byteLength;
        packet.rawData = msg;
        packet.sourceAddress = rinfo.address;
        packet.sourcePort = rinfo.port;

        var reader = new BinaryReader(msg);

        // Connecting, read headers
        if (this.state < SIGNONSTATE_CONNECTED) {
            packet.header = reader.readUint32();
            switch (packet.header) {
                case CONNECTIONLESS_HEADER:
                    errorWithTime("STVClient.net.NetChan.handleMessage(): Received CONNECTIONLESS_HEADER");
                    this.handleConnectionlessPacket(packet, reader);
                    break;

                default:
                    errorWithTime(`STVClient.net.NetChan.handleMessage(): Received unhandled header ${packet.header}`);
                    return;
            }

            return;
        }

        // Connected, using netchannels
        this.handleConnectedPacket(packet, reader);
    }

    handleConnectionlessPacket = (packet: NetPacket, reader: BinaryReader) => {
        logWithTime(`STVClient.net.NetChan.handleConnectionlessPacket()`);
        packet.messageType = reader.readUint8();

        switch (packet.messageType) {
            case S2C_CHALLENGE:
                logWithTime("STVClient.net.NetChan.handleConnectionlessPacket(): Received S2C_CHALLENGE");
                packet.sequenceNr = reader.readUint32();
                this.handleChallenge(reader);
                break;

            case S2C_CONNECTION:
                logWithTime("STVClient.net.NetChan.handleConnectionlessPacket(): Received S2C_CONNECTION");
                packet.sequenceNr = reader.readUint32();
                this.handleConnection(reader);
                break;

            case S2C_CONNREJECT:
                // Spoofed?
                // This shouldn't be needed since we already check the ip and port
                // in NetChan.onMessage but let's be sure.
                if (this.state == SIGNONSTATE_CHALLENGE) {
                    if (this.game !== "csgo") {
                        packet.sequenceNr = reader.readUint32();
                    }
                    var reason = reader.readString();
                    errorWithTime(`STVClient.net.NetChan.handleConnectionlessPacket(): Received S2C_CONNREJECT: ${reason}`);
                    this.state = SIGNONSTATE_NONE;
                }
                return;

            default:
                errorWithTime(`STVClient.net.NetChan.handleConnectionlessPacket(): Received unhandled message type ${packet.messageType} ('${String.fromCharCode(packet.messageType)}')`);
                return;
        }
    }

    handleChallenge = (reader: BinaryReader) => {
        logWithTime(`STVClient.net.NetChan.handleChallenge()`);

        if (this.state !== SIGNONSTATE_CHALLENGE) return;

        var challengeNr = BigInt(0);
        var authProtocol = 0;

        if (this.game === "tf") {
            challengeNr = reader.readUint64();
            authProtocol = reader.readUint32();
        } else if (this.game === "csgo") {
            authProtocol = reader.readUint32();
            challengeNr = reader.readUint64();
        }

        var encryptionSize = 0;
        var encryptionKey = new Array<number>(STEAM_KEYSIZE);
        var steamId = BigInt(0);
        var secure = false;

        switch (authProtocol) {
            case PROTOCOL_STEAM:
                logWithTime("STVClient.net.NetChan.handleChallenge(): Received PROTOCOL_STEAM");
                encryptionSize = reader.readUint16();
                encryptionKey = reader.readBytes(encryptionSize);
                steamId = reader.readUint64();
                secure = reader.readBoolean();
                break;

            case PROTOCOL_HASHEDCDKEY:
                logWithTime("STVClient.net.NetChan.handleChallenge(): Received PROTOCOL_HASHEDCDKEY");
                break;

            default:
                errorWithTime(`STVClient.net.NetChan.handleChallenge(): Received unhandled auth protocol ${authProtocol}`);
                return;
        }

        // "000000"
        var padding = reader.readString();

        console.log(
            `   encryptionSize: ${encryptionSize}\n` +
            `   encryptionKey: [${encryptionKey.length}]\n` +
            `   steamId: ${steamId}\n` +
            `   secure: ${secure}`
        );

        // connect
        this.sendConnectPacket(challengeNr, authProtocol, encryptionSize, encryptionKey, steamId, secure, this.name, this.password);
    }

    handleConnection = (reader: BinaryReader) => {
        logWithTime(`STVClient.net.NetChan.handleConnection()`);

        if (this.state !== SIGNONSTATE_CHALLENGE) return;
        this.state = SIGNONSTATE_CONNECTED;

        this.inSequenceNr = 0;
        this.outSequenceNrAck = 0;
        this.lastReceived = 0;
        this.inReliableState = 0;

        // Engine client code inits a TCP socket here,
        // but looks like HLTV clients just use UDP snapshots.

        // TODO:
        // client should send Net_SetConVar after connecting
        // https://github.com/VSES/SourceEngine2007/blob/master/se2007/engine/hltvclient.cpp#L345

        // https://github.com/VSES/SourceEngine2007/tree/master/src_main/engine/host.cpp#L1576
        // shouldn't do anything if all cvars are default (send empty NET_SetConVar)

        var setConVar = new NET_SetConvar();
        this.sendNetMessage(setConVar);
    }

    processPacketHeader = (packet: NetPacket, reader: BinaryReader): number => {
        // https://github.com/VSES/SourceEngine2007/tree/master/se2007/engine/net_chan.cpp#L2095
        var sequence = reader.readUint32();
        var sequenceAck = reader.readUint32();
        var flags = reader.readUint8();

        if (this.shouldChecksumPackets) {
            var checksum = reader.readUint16();
            var offset = reader.getOffset();

            if (offset % 8) {
                throw ("checksum not byte aligned");
            }

            var checkSumBytes = reader.getSize() - offset / 8;
            var buff = Buffer.alloc(checkSumBytes);
            reader.copy(buff, offset / 8);
            var sum = this.bufferToCheckSum(buff);

            if (checksum !== sum) {
                errorWithTime(`Checksum doesn't match data! ( ${checksum} !== ${sum})`);
                return -1;
            }

            reader.seek(offset, SeekOrigin.Begin);
        }

        var relState = reader.readUint8(); // 8 channels, 1 bit for each channel
        var choked = 0;

        if (flags & PACKET_FLAG_CHOKED) {
            console.log("PACKET_FLAG_CHOKED");
            choked = reader.readUint8();
        }

        // discard stale or duplicate packets
        if (sequence <= this.inSequenceNr) {
            errorWithTime(`Duplicate or out of order packet ${sequence} at ${this.inSequenceNr}`);
            return -1;
        }

        this.droppedPackets = sequence - (this.inSequenceNr + choked + 1);

        for (let i = 0; i < MAX_SUBCHANNELS; i++) {
            var bitmask = 1 << i;
            //TEST this.outReliableState = relState;

            // data of channel has been acknowledged
            var subChan = this.subChannels[i];
            if (subChan.index !== i) {
                throw ("NetChan.processPacketHeader(): incorrect subchannel index");
            }

            if ((this.outReliableState & bitmask) == (relState & bitmask)) {
                if (subChan.state == SUBCHANNEL_DIRTY) {
                    // subchannel was marked dirty during changelevel, waiting list is already cleared
                    subChan.free();

                } else if (subChan.sendSeqNr > sequenceAck) {
                    errorWithTime(`NetChan.processPacketHeader(): invalid reliable state ${i}`);
                    return -1;

                } else if (subChan.state == SUBCHANNEL_WAITING) {
                    for (let j = 0; j < MAX_STREAMS; j++) {
                        if (subChan.numFragments[j] == 0) {
                            continue;
                        }

                        if (this.waitingList[j].length <= 0) {
                            throw (`NetChan.processPacketHeader(): invalid waiting list length`);
                        }

                        var data = this.waitingList[j][0];

                        // tell waiting list, that we received the acknowledge
                        data.ackedFragments += subChan.numFragments[j];
                        data.pendingFragments -= subChan.numFragments[j];
                    }

                    subChan.free();
                }
            } else {
                // subchannel doesnt match

                if (subChan.sendSeqNr <= sequenceAck) {
                    if (subChan.state == SUBCHANNEL_FREE) {
                        throw (`NetChan.processPacketHeader(): invalid subChan.state`);
                    }

                    if (subChan.state == SUBCHANNEL_WAITING) {
                        logWithTime(`Resending subchan ${subChan.index}: start ${subChan.startFragment}, num ${subChan.numFragments}`);
                        subChan.state = SUBCHANNEL_TOSEND;
                    } else if (subChan.state == SUBCHANNEL_DIRTY) {
                        // remote host lost dirt channel data, flip bit back
                        var bit = 1 << subChan.index;
                        FLIPBIT(this.outReliableState, bit);
                        subChan.free();
                    }
                }
            }
        }

        this.inSequenceNr = sequence;
        this.outSequenceNrAck = sequenceAck;

        // Update waiting list status

        for (let i = 0; i < MAX_STREAMS; i++) {
            this.checkWaitingList(i);
        }

        return flags;
    }

    handleConnectedPacket = (packet: NetPacket, reader: BinaryReader) => {
        logWithTime(`STVClient.net.NetChan.handleConnectedPacket()`);

        var flags = 0;
        if (true /* hasHeader */) {
            flags = this.processPacketHeader(packet, reader);
        }

        if (flags === -1) {
            // invalid header/packet
            return;
        }

        this.lastReceived = packet.received;

        if (flags & PACKET_FLAG_COMPRESSED) {
            errorWithTime("Received compressed packet");
            return;
        }

        if (flags & PACKET_FLAG_ENCRYPTED) {
            errorWithTime("Received encrypted packet");
            return;
        }

        if (flags & PACKET_FLAG_SPLIT) {
            errorWithTime("Received split packet");
            return;
        }

        var padding = DECODE_PAD_BITS(flags);

        console.log(`remaining: ${reader.getRemaining()} bits, padding: ${padding}`);

        console.log(
            `  seq: ${this.inSequenceNr}` +
            `  ack: ${this.outSequenceNrAck}` +
            `  rel: ${flags & PACKET_FLAG_RELIABLE ? 1 : 0}` +
            `  size: ${packet.wireSize}` +
            `  time: ${packet.received}`
        );

        if (flags & PACKET_FLAG_RELIABLE) {
            var bit = reader.readBitsUint(3);

            for (var i = 0; i < MAX_STREAMS; i++) {
                if (reader.readOneBit()) {
                    console.log(`subchannel ${i} has data`);
                    if (!this.readSubChannelData(reader, i)) {
                        errorWithTime(`NetChan.handleConnectedPacket(): failed to read sub channels`);
                        return; // error while reading fragments, drop whole packet
                    }
                }
            }

            // flip subChannel bit to signal successfull receiving
            FLIPBIT(this.inReliableState, bit);

            for (i = 0; i < MAX_STREAMS; i++) {
                if (!this.checkReceivingList(i)) {
                    errorWithTime(`NetChan.handleConnectedPacket(): failed to check receiving list`);
                    return; // error while processing 
                }
            }
        }

        console.log(`remaining after sub: ${reader.getRemaining()} bits, padding: ${padding}`);

        if (reader.getRemaining() > 0) {
            this.messageHandler.processMessages(reader);
        }

        //this.sendEmptyAck();
    }

    readSubChannelData(reader: BinaryReader, stream: number): boolean {
        var data = this.receiveList[stream];
        var startFragment = 0;
        var numFragments = 0;
        var offset = 0;
        var length = 0;

        var singleBlock = reader.readOneBit();

        if (!singleBlock) {
            startFragment = reader.readBitsUint(MAX_FILE_SIZE_BITS - FRAGMENT_BITS);
            numFragments = reader.readBitsUint(3);
            offset = startFragment * FRAGMENT_SIZE;
            length = numFragments * FRAGMENT_SIZE;
        }

        console.log(
            "startFragment: " + startFragment +
            "\nnumFragments: " + numFragments +
            "\noffset: " + offset +
            "\nlength: " + length
        );

        if (offset == 0) {
            // First fragment, read header info
            data.filename = "";
            data.isCompressed = false;
            data.transferID = 0;

            if (singleBlock) {
                // compressed?
                if (reader.readOneBit()) {
                    data.isCompressed = true;
                    data.uncompressedSize = reader.readBitsUint(MAX_FILE_SIZE_BITS);
                } else {
                    data.isCompressed = false;
                }

                data.bytes = reader.readBitsUint(NET_MAX_PALYLOAD_BITS);
            } else {
                // a file?
                if (reader.readOneBit()) {
                    data.transferID = reader.readBitsUint(32);
                    data.filename = reader.readString();
                }

                // compressed?
                if (reader.readOneBit()) {
                    data.isCompressed = true;
                    data.uncompressedSize = reader.readBitsUint(MAX_FILE_SIZE_BITS);
                } else {
                    data.isCompressed = false;
                }

                data.bytes = reader.readBitsUint(NET_MAX_PALYLOAD_BITS);
            }

            if (data.buffer) {
                // last transmission was aborted, free data
                delete (data.buffer);
                logWithTime(`Fragment transmission aborted at ${data.ackedFragments}/${data.numFragments}`);
            }

            data.bits = data.bytes * 8;
            data.buffer = Buffer.alloc(padNumber(data.bytes, 4));
            data.asTCP = false;
            data.numFragments = BYTES2FRAGMENTS(data.bytes);
            data.ackedFragments = 0;
            //data.file = null;

            if (singleBlock) {
                numFragments = data.numFragments;
                length = numFragments * FRAGMENT_SIZE;
            }

        } else {
            if (data.buffer == null) {
                // This can occur if the packet containing the "header" (offset == 0) is dropped.  Since we need the header to arrive we'll just wait
                //  for a retry
                // ConDMsg("Received fragment out of order: %i/%i\n", startFragment, numFragments );
                errorWithTime(`Received fragment out of order: ${startFragment}/${numFragments}`);
                return false;
            }
        }

        if (startFragment + numFragments == data.numFragments) {
            // we are receiving the last fragment, adjust length
            var rest = FRAGMENT_SIZE - (data.bytes % FRAGMENT_SIZE);
            if (rest < FRAGMENT_SIZE) {
                length -= rest;
            }
        }

        if (offset + length > data.bytes) {
            throw ("NetChan.readSubChannelData(): offset + length > data.bytes");
        }

        // read data
        var old = data.buffer;
        data.buffer = Buffer.alloc(old.byteLength + length);
        old.copy(data.buffer, 0, 0, old.byteLength - 1);

        reader.seek(offset, SeekOrigin.Begin);
        var bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            bytes[i] = reader.readBitsUint(8);
        }

        data.buffer.fill(bytes, offset, offset + length);
        data.ackedFragments += numFragments;

        logWithTime(`Received fragments: start ${startFragment}, num ${numFragments}`);
        return true;
    }

    checkReceivingList(list: number): boolean {
        var data = this.receiveList[list];

        if (data.buffer == null) {
            return true;
        }

        if (data.ackedFragments < data.numFragments) {
            return true;
        }

        if (data.ackedFragments > data.numFragments) {
            errorWithTime(`NetChan.checkReceivingList(): too many fragments ${data.ackedFragments}/${data.numFragments}`);
            return false;
        }

        // got all fragments
        logWithTime(`Receiving complete: ${data.numFragments} fragments, ${data.bytes} bytes`);

        if (data.isCompressed) {
            // UncompressFragments(data);
            throw ("not implemented");
        }

        if (data.filename.length <= 0) {
            var reader = new BinaryReader(data.buffer);
            // parse net message
            if (this.messageHandler.processMessages(reader)) {
                // stop reading any further
                return false;
            }
        } else {
            // received a file
            throw ("not implemented");
        }

        if (data.buffer) {
            delete (data.buffer);
            data.buffer = null;
        }

        return true;
    }

    checkWaitingList(list: number) {
        // go through waiting lists and mark fragments sent with this seqnr packet
        if (this.waitingList[list].length == 0 || this.outSequenceNrAck <= 0) {
            return; // no data in list
        }

        var data = this.waitingList[list][0]; // get head

        if (data.ackedFragments == data.numFragments) {
            // all fragments were sent successfully
            logWithTime(`Sending complete: ${data.numFragments} fragments, ${data.bytes} bytes`);

            this.removeHeadInWaitingList(list);

            return;
        }

        if (data.ackedFragments > data.numFragments) {
            errorWithTime(`NetChan.checkWaitingList(): invalid acknowledge fragments ${data.ackedFragments}/${data.numFragments}`);
        }
    }

    removeHeadInWaitingList(list: number) {
        if (this.waitingList[list].length < 0) {
            throw (`NetChan.removeHeadInWaitingList(): waitingList[${list}] count is 0`);
        }

        var data = this.waitingList[list][0];

        if (data.buffer) {
            delete (data.buffer);
        }

        /* 
        if ( data->file	!= FILESYSTEM_INVALID_HANDLE )
        {
            g_pFileSystem->Close( data->file );
            data->file = FILESYSTEM_INVALID_HANDLE;
        }
        */

        this.waitingList[list].splice(0, 1);
    }

    getFreeSubChannel(): SubChannel {
        for (let i = 0; i < MAX_SUBCHANNELS; i++) {
            if (this.subChannels[i].state == SUBCHANNEL_FREE) {
                return this.subChannels[i];
            }
        }

        return null;
    }

    // https://github.com/VSES/SourceEngine2007/tree/master/src_main/engine/net_chan.cpp#L1475-L1513
    bufferToCheckSum(buff: Buffer): number {
        var crc = CRC32.buf(buff);
        var lowPart = crc & 0xffff;
        var highPart = (crc >> 16) & 0xffff;
        return lowPart ^ highPart;
    }
}