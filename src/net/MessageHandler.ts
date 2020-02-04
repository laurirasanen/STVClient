import { BinaryReader } from "../BinaryReader";
import { CONNECTIONLESS_HEADER, S2C_CHALLENGE, PROTOCOL_STEAM, SIGNONSTATE_NONE, SIGNONSTATE_CHALLENGE, PROTOCOL_HASHEDCDKEY, STEAM_KEYSIZE, S2C_CONNREJECT } from "./Protocol";
import { NetPacket } from "./Structures";
import { NetChan } from "./NetChan";
import { warnWithTime, errorWithTime, logWithTime } from "../Util";

export class MessageHandler {
    state: number;
    channel: NetChan;
    password: string;
    name: string;

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

            case S2C_CONNREJECT:
                var reason = reader.readString();
                errorWithTime(`STVClient.net.MessageHandler.handleConnectionlessPacket(): Received S2C_CONNREJECT: ${reason}`);
                return;

            default:
                errorWithTime(`STVClient.net.MessageHandler.handleConnectionlessPacket(): Received unhandled message type ${packet.messageType}`);
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
}