import { BinaryReader } from "../BinaryReader";
import { MAX_STREAMS, SUBCHANNEL_FREE, SUBCHANNEL_DIRTY } from "./Protocol";

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

export class ConVar {
    name: string;
    value: string;
}

export class DataFragment {
    // FileHandle_t file;
    filename: string;
    buffer: Buffer;
    bytes: number;
    bits: number;
    transferID: number;
    isCompressed: boolean;
    uncompressedSize: number;
    asTCP: boolean;
    numFragments: number;
    ackedFragments: number;
    pendingFragments: number;
}

export class SubChannel {
    startFragment: Array<number>;
    numFragments: Array<number>;
    sendSeqNr: number;
    state: number; // 0 = free, 1 = scheduled to send, 2 = send & waiting, 3 = dirty
    index: number; // index in m_SubChannels[]

    free() {
        this.state = SUBCHANNEL_FREE;
        this.sendSeqNr = -1;
        for (let i = 0; i < MAX_STREAMS; i++) {
            this.numFragments[i] = 0;
            this.startFragment[i] = -1;
        }
    }

    constructor(index: number) {
        this.index = index;
        this.sendSeqNr = -1;
        this.state = SUBCHANNEL_FREE;
        this.startFragment = new Array<number>();
        this.numFragments = new Array<number>();
    }
}