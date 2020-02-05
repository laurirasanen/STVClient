import { BinaryReader, SeekOrigin } from "../BinaryReader";
import { NetPacket } from "./Structures";
import { NetChan } from "./NetChan";
import { warnWithTime, errorWithTime, logWithTime } from "../Util";
import {
    CONNECTIONLESS_HEADER,
    S2C_CHALLENGE,
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
    MAX_STREAMS
} from "./Protocol";
import * as lsjz from "lzjs";

export class MessageHandler {
    state: number;
    channel: NetChan;
    password: string;
    name: string;
    inSequenceNr: number = -1;
    outSequenceNrAck: number = -1;
    droppedPackets: number = 0;
    lastReceived: number = 0;
    inReliableState: number = 0;

    constructor(address: string, password: string, name: string) {
        this.password = password;
        this.name = name;
        this.state = SIGNONSTATE_NONE;
        this.channel = new NetChan(address, this);
    }

    onConnect = () => {
        if (this.state == SIGNONSTATE_NONE) {
            this.state = SIGNONSTATE_CHALLENGE;
            this.channel.sendChallengePacket();
        } else {
            errorWithTime(`STVClient.net.MessageHandler.onConnect called with state ${this.state}`);
        }
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
                    errorWithTime("STVClient.net.MessageHandler.handleMessage(): Received CONNECTIONLESS_HEADER");
                    this.handleConnectionlessPacket(packet, reader);
                    break;

                default:
                    errorWithTime(`STVClient.net.MessageHandler.handleMessage(): Received unhandled header ${packet.header}`);
                    return;
            }

            return;
        }

        // Connected
        this.handleConnectedPacket(packet, reader);
    }

    handleConnectionlessPacket = (packet: NetPacket, reader: BinaryReader) => {
        logWithTime(`STVClient.net.MessageHandler.handleConnectionlessPacket()`);
        packet.messageType = reader.readUint8();
        packet.sequenceNr = reader.readUint32();

        switch (packet.messageType) {
            case S2C_CHALLENGE:
                logWithTime("STVClient.net.MessageHandler.handleConnectionlessPacket(): Received S2C_CHALLENGE");
                this.handleChallenge(reader);
                break;

            case S2C_CONNECTION:
                logWithTime("STVClient.net.MessageHandler.handleConnectionlessPacket(): Received S2C_CONNECTION");
                this.handleConnection(reader);
                break;

            case S2C_CONNREJECT:
                // Spoofed?
                // This shouldn't be needed since we already check the ip and port
                // in NetChan.onMessage but let's be sure.
                if (this.state == SIGNONSTATE_CHALLENGE) {
                    var reason = reader.readString();
                    errorWithTime(`STVClient.net.MessageHandler.handleConnectionlessPacket(): Received S2C_CONNREJECT: ${reason}`);
                    this.state = SIGNONSTATE_NONE;
                }
                return;

            default:
                errorWithTime(`STVClient.net.MessageHandler.handleConnectionlessPacket(): Received unhandled message type ${packet.messageType} ('${String.fromCharCode(packet.messageType)}')`);
                return;
        }
    }

    handleChallenge = (reader: BinaryReader) => {
        logWithTime(`STVClient.net.MessageHandler.handleChallenge()`);

        if (this.state !== SIGNONSTATE_CHALLENGE) return;

        var challengeNr = reader.readUint64();
        var authProtocol = reader.readUint32();
        var encryptionSize = 0;
        var encryptionKey = new Array<number>(STEAM_KEYSIZE);
        var steamId = BigInt(0);
        var secure = false;

        switch (authProtocol) {
            case PROTOCOL_STEAM:
                logWithTime("STVClient.net.MessageHandler.handleChallenge(): Received PROTOCOL_STEAM");
                encryptionSize = reader.readUint16();
                encryptionKey = reader.readBytes(encryptionSize);
                steamId = reader.readUint64();
                secure = reader.readBoolean();
                break;

            case PROTOCOL_HASHEDCDKEY:
                logWithTime("STVClient.net.MessageHandler.handleChallenge(): Received PROTOCOL_HASHEDCDKEY");
                break;

            default:
                errorWithTime(`STVClient.net.MessageHandler.handleChallenge(): Received unhandled auth protocol ${authProtocol}`);
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
        this.channel.sendConnectPacket(challengeNr, authProtocol, encryptionSize, encryptionKey, steamId, secure, this.name, this.password);
    }

    handleConnection = (reader: BinaryReader) => {
        logWithTime(`STVClient.net.MessageHandler.handleConnection()`);

        if (this.state !== SIGNONSTATE_CHALLENGE) return;
        this.state = SIGNONSTATE_CONNECTED;

        this.inSequenceNr = 0;
        this.outSequenceNrAck = 0;
        this.lastReceived = 0;
        this.inReliableState = 0;

        // Engine client code inits a TCP socket here,
        // but looks like HLTV clients just use UDP snapshots.


        //
        // need to request full snapshot after inital connect?
        //

        // otherwise server keeps sending same message with incrementing
        // first byte until we do something
        // 01 00 00 00 00 00 00 00 20 xx xx xx xx xx xx xx
        // v
        // 02 00 00 00 00 00 00 00 20 xx xx xx xx xx xx xx

        // sequenceNr     frame        type  ?
        // [xx xx xx xx] [00 00 00 00] [20] [xx xx xx xx xx xx xx]


        // client:
        // sequenceNr     frame        type  ?
        // [01 00 00 00] [00 00 00 00] [21] [xx xx xx xx xx xx xx] ...
        //  + 700ish more bytes (convars?)


    }

    handleConnectedPacket = (packet: NetPacket, reader: BinaryReader) => {
        logWithTime(`STVClient.net.MessageHandler.handleConnectedPacket()`);

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

        if (flags & PACKET_FLAG_RELIABLE) {
            // https://github.com/VSES/SourceEngine2007/blob/43a5c90a5ada1e69ca044595383be67f40b33c61/se2007/engine/net_chan.cpp#L2304

            // read 3 bits for subchannel mask
            //  bit = 1<<msg.ReadUBitLong( 3 );

            for (let i = 0; i < MAX_STREAMS; i++) {
                // read 1 bit
                // should be 0 if there's no sub channel data                
            }

            // flip subChannel bit to signal successfull receiving
            // FLIPBIT(m_nInReliableState, bit);
        }

        if (reader.getRemaining() > 0) {
            // parse and handle all messages 
            // if ( !ProcessMessages( msg ) )
            // {
            //     return;	// disconnect or error
            // }
            console.log(`remaining: ${reader.getRemaining()}`);
        }

        // m_MessageHandler->PacketEnd();
    }

    processPacketHeader = (packet: NetPacket, reader: BinaryReader): number => {
        // https://github.com/VSES/SourceEngine2007/tree/master/se2007/engine/net_chan.cpp#L2095
        var sequence = reader.readUint32();
        var sequenceAck = reader.readUint32();
        var flags = reader.readUint8();

        if (true /*ShouldCheckSumPackets()*/) {
            var checksum = reader.readUint16();
            var offset = reader.getOffset();
            //var checkSumBytes = reader.getRemaining();
            //var buff = Buffer.alloc(checkSumBytes);
            //reader.copy(buff, offset);

            // https://github.com/VSES/SourceEngine2007/tree/master/src_main/engine/net_chan.cpp#L1475-L1513
            var sum = 0;
            while (reader.getRemaining() > 0) {
                var byte = reader.readUint8();
                sum ^= (byte & 0xffff);
                sum ^= ((byte >> 16) & 0xffff);
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