import { BinaryReader } from "../BinaryReader";

export class NetPacket {
    header: number;
    messageType: number;
    sequenceNr: number;
    sourceAddress: string;
    sourcePort: number;
    received: number;
    rawData: Buffer;
    message: BinaryReader;
    size: number;
    wireSize: number;
    next: NetPacket;
}

export class FlowStats {
    size: number;
    time: number;
}