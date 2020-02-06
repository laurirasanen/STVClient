import { Socket, createSocket } from "dgram";
import * as lsjz from "lzjs";
import { MessageHandler } from "./MessageHandler";
import { logWithTime, errorWithTime } from "../Util";
import { BinaryWriter } from "../BinaryWriter";
import { BinaryReader, SeekOrigin } from "../BinaryReader";
import { NetPacket } from "./Structures";
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
    PROTOCOL_HASHEDCDKEY,
    STEAM_KEYSIZE, S2C_CONNREJECT,
    S2C_CONNECTION,
    SIGNONSTATE_CONNECTED,
    PACKET_FLAG_CHOKED,
    PACKET_FLAG_RELIABLE,
    PACKET_FLAG_COMPRESSED,
    PACKET_FLAG_ENCRYPTED,
    PACKET_FLAG_SPLIT,
    MAX_SUBCHANNELS,
    MAX_STREAMS,
    NETMSG_TYPE_BITS,
    net_NOP,
    NET_MAX_DATAGRAM_PAYLOAD
} from "./Protocol";

export class NetChan {
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

    state: number;
    password: string;
    name: string;
    inSequenceNr: number = -1;
    outSequenceNrAck: number = -1;
    droppedPackets: number = 0;
    lastReceived: number = 0;
    inReliableState: number = 0;

    constructor(address: string, password: string, name: string, handler: MessageHandler) {
        logWithTime(`STVClient.Net.NetChan(${address})`);

        this.address = address.split(":")[0];
        this.port = parseInt(address.split(":")[1]);
        this.messageHandler = handler;
        this.rate = 0.03;
        this.timeOut = 30;

        this.password = password;
        this.name = name;
        this.state = SIGNONSTATE_NONE;

        this.socket = createSocket("udp4");
        this.socket.bind(27015, "192.168.1.99");
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

    sendChallengePacket() {
        logWithTime(`STVClient.net.NetChan.sendChallengePacket()`);
        var writer = new BinaryWriter();
        writer.writeUint32(CONNECTIONLESS_HEADER);
        writer.writeUint8(A2S_GETCHALLENGE);
        var buf = Buffer.alloc(writer.getSize());
        writer.copy(buf);

        this.send(buf);
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
        writer.writeString(GAME_VERSION_TF.toString());

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

        var buf = Buffer.alloc(writer.getSize());
        writer.copy(buf);
        this.send(buf);
    }

    handleMessage = (msg: Buffer, rinfo) => {
        var packet = new NetPacket();
        packet.received = Date.now();
        packet.wireSize = msg.byteLength;
        packet.rawData = msg;
        packet.sourceAddress = rinfo.address;
        packet.sourcePort = rinfo.port;

        var reader = new BinaryReader(msg);

        // Connecting
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

        // Connected
        this.handleConnectedPacket(packet, reader);
    }

    handleConnectionlessPacket = (packet: NetPacket, reader: BinaryReader) => {
        logWithTime(`STVClient.net.NetChan.handleConnectionlessPacket()`);
        packet.messageType = reader.readUint8();
        packet.sequenceNr = reader.readUint32();

        switch (packet.messageType) {
            case S2C_CHALLENGE:
                logWithTime("STVClient.net.NetChan.handleConnectionlessPacket(): Received S2C_CHALLENGE");
                this.handleChallenge(reader);
                break;

            case S2C_CONNECTION:
                logWithTime("STVClient.net.NetChan.handleConnectionlessPacket(): Received S2C_CONNECTION");
                this.handleConnection(reader);
                break;

            case S2C_CONNREJECT:
                // Spoofed?
                // This shouldn't be needed since we already check the ip and port
                // in NetChan.onMessage but let's be sure.
                if (this.state == SIGNONSTATE_CHALLENGE) {
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

        var challengeNr = reader.readUint64();
        var authProtocol = reader.readUint32();
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
        // client sends some sort of net msg immediately after connecting
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

        console.log(
            `  seq: ${this.inSequenceNr}` +
            `  ack: ${this.outSequenceNrAck}` +
            `  rel: ${flags & PACKET_FLAG_RELIABLE ? 1 : 0}` +
            `  size: ${packet.wireSize}` +
            `  time: ${packet.received}`
        );

        this.lastReceived = packet.received;

        // m_MessageHandler->PacketStart( m_nInSequenceNr, m_nOutSequenceNrAck );

        // TODO: create a reader for individual bits for NetMessages
        // https://github.com/VSES/SourceEngine2007/blob/master/se2007/engine/net_chan.cpp#L1821

        if (flags & PACKET_FLAG_RELIABLE) {
            // https://github.com/VSES/SourceEngine2007/tree/master/se2007/engine/net_chan.cpp#L2304
            console.log(`PACKET_FLAG_RELIABLE`);

            // read 3 bits for subchannel mask
            //  bit = 1<<msg.ReadUBitLong( 3 );
            var bits = reader.readBits(3);

            for (let i = 0; i < MAX_STREAMS; i++) {
                // read 1 bit
                // should be 0 if there's no sub channel data
                var sub = reader.readOneBit();
                if (sub) {
                    errorWithTime(`Expected subchannel bit to be 0`);
                    return;
                }
            }

            // flip subChannel bit to signal successfull receiving
            var invBits = new Array<boolean>(3);
            for (let i = 0; i < 3; i++) {
                invBits.push(!bits[i]);
            }
        }

        console.log(`remaining: ${reader.getRemaining()} bits`);

        this.messageHandler.processMessages(reader);
        
        console.log(`remaining after: ${reader.getRemaining()} bits`);
    }

    processPacketHeader = (packet: NetPacket, reader: BinaryReader): number => {
        // https://github.com/VSES/SourceEngine2007/tree/master/se2007/engine/net_chan.cpp#L2095
        var sequence = reader.readUint32();
        var sequenceAck = reader.readUint32();
        var flags = reader.readUint8();

        if (true /*ShouldCheckSumPackets()*/) {
            var checksum = reader.readBitsUint(16);
            var offset = reader.getOffset();

            // https://github.com/VSES/SourceEngine2007/tree/master/src_main/engine/net_chan.cpp#L1475-L1513
            // FIXME
            var sum = 0;
            while (reader.getRemaining() >= 32) {
                var val = reader.readBitsUint(32);
                sum ^= (val & 0xffff);
                sum ^= ((val >> 16) & 0xffff);
            }

            if (checksum !== sum) {
                errorWithTime(`Checksum doesn't match data! ( ${checksum} !== ${sum})`);
                //return -1;
            }

            reader.seek(offset, SeekOrigin.Begin);
        }

        var reliableStates = reader.readUint8(); // 8 channels, 1 bit for each channel
        var choked = 0;

        if (flags & PACKET_FLAG_CHOKED) {
            choked = reader.readUint8();
        }

        // discard stale or duplicate packets
        if (sequence <= this.inSequenceNr) {
            errorWithTime(`Duplicate or out of order packet ${sequence} at ${this.inSequenceNr}`);
            return -1;
        }

        this.droppedPackets = sequence - (this.inSequenceNr + choked + 1);

        // for (let i = 0; i < MAX_SUBCHANNELS; i++) {
        // }

        this.inSequenceNr = sequence;
        this.outSequenceNrAck = sequenceAck;
        return flags;
    }
}