import { Socket, createSocket } from "dgram";
import * as lsjz from "lzjs";
import { MessageHandler } from "./MessageHandler";
import { logWithTime, errorWithTime } from "../Util";
import { BinaryWriter } from "../BinaryWriter";
import {
    CONNECTIONLESS_HEADER,
    PROTOCOL_HASHEDCDKEY,
    PACKET_FLAG_COMPRESSED,
    NET_MAX_DATAGRAM_PAYLOAD,
    CD_KEY,
    PROTOCOL_VERSION,
    C2S_CONNECT,
    net_SetConVar,
    HEADER_BYTES,
    A2S_GETCHALLENGE,
    PROTOCOL_STEAM
    GAME_VERSION_TF
} from "./Protocol";

export class NetChan {
    private socket: Socket;
    private maxReliablePayloadSize: number;
    private address: string;
    private port: number;
    private lastReceived: number;
    private connectTime: number;
    private rate: number;
    private clearTime: number;
    private messageHandler: MessageHandler;
    private timeOut: number;
    private challengeNr: BigInt;

    constructor(address: string, handler: MessageHandler) {
        logWithTime(`STVClient.Net.NetChan(${address})`);

        this.address = address.split(":")[0];
        this.port = parseInt(address.split(":")[1]);
        this.lastReceived = Date.now();
        this.connectTime = this.lastReceived;
        this.messageHandler = handler;
        this.rate = 0.03;
        this.timeOut = 30;

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
        this.messageHandler.onConnect();
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
        this.messageHandler.handleMessage(msg, rinfo);
    }

    send = (data: Buffer | string, compress: boolean = false) => {
        if (compress) {
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

    sendConvarPacket(): Buffer {
        var writer = new BinaryWriter();
        writer.writeUint8(net_SetConVar);
        writer.writeUint8(0);   // sending 0 convars
        var buf = Buffer.alloc(writer.getSize());
        writer.copy(buf);
        return buf;
    }
}