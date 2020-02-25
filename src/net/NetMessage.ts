import { BinaryReader, SeekOrigin } from "../BinaryReader";
import { ConVar } from "./Structures";
import { BinaryWriter } from "../BinaryWriter";
import { MAX_EVENT_BITS } from "./GameEvents";
import { errorWithTime } from "../Util";
import { net_Tick, NETMSG_TYPE_BITS, NUM_NEW_COMMAND_BITS, clc_Move, net_SetConVar } from "./Protocol";

// https://github.com/VSES/SourceEngine2007/tree/master/src_main/common/netmessages.h
// https://github.com/VSES/SourceEngine2007/tree/master/src_main/common/netmessages.cpp

const netTickScaleUp = 100000.0;

export class NetMessage {
    name: string;

    readFromBuffer(reader: BinaryReader): boolean {
        return true;
    }

    writeToBuffer(writer: BinaryWriter): boolean {
        return true;
    }

    setName(name: string) {
        this.name = name;
    }

    getName() {
        return this.name;
    }

    toString() {
        return "NetMessage";
    }
}

//
// Common messages
//

export class NET_Tick extends NetMessage {
    public tick: number;
    public hostFrameTime: number;
    public hostFrameTimeStdDeviation: number;

    constructor() {
        super();

        this.setName("Tick");
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            this.tick = reader.readBitsUint(32);
            this.hostFrameTime = reader.readFloatBits(16) / netTickScaleUp;
            this.hostFrameTimeStdDeviation = reader.readFloatBits(16) / netTickScaleUp;
        } catch (err) {
            console.log(err);
            return false;
        }

        return true;
    }

    writeToBuffer(writer: BinaryWriter): boolean {
        try {
            writer.writeBitsUint(net_Tick, NETMSG_TYPE_BITS);
            writer.writeBitsUint(this.tick, 32);
            writer.writeBitsUint(Math.max(0, Math.min(65535, this.hostFrameTime * netTickScaleUp)), 16);
            writer.writeBitsUint(Math.max(0, Math.min(65535, this.hostFrameTimeStdDeviation * netTickScaleUp)), 16);
        } catch (err) {
            console.log(err);
            return false;
        }
        return true;
    }

    toString(): string {
        return `${this.getName()}: tick ${this.tick}`;
    }
}

export class NET_SetConvar extends NetMessage {
    conVars: Array<ConVar>;

    constructor() {
        super();

        this.setName("SetConvar");
        this.conVars = new Array<ConVar>();
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            var numVars = reader.readBitsUint(8);
            if (numVars <= 0) {
                errorWithTime(`NET_SetConvar.readFromBuffer(): Invalid numVars ${numVars}`);
                return false;
            }
            for (let i = 0; i < numVars; i++) {
                var cvar = new ConVar();
                cvar.name = reader.readString();
                cvar.value = reader.readString();
                this.conVars.push(cvar);
            }
        } catch (err) {
            console.log(err);
            return false;
        }

        return true;
    }

    writeToBuffer(writer: BinaryWriter): boolean {
        try {
            writer.writeBitsUint(net_SetConVar, NETMSG_TYPE_BITS);
            var numVars = this.conVars.length;
            writer.writeBitsUint(numVars, 8);
            for (let i = 0; i < numVars; i++) {
                writer.writeString(this.conVars[i].name);
                writer.writeString(this.conVars[i].value);
            }
        } catch (err) {
            console.log(err);
            return false;
        }
        return true;
    }

    toString(): string {
        return `${this.getName()}: ${this.conVars.length} cvars, "${this.conVars[0].name}"="${this.conVars[0].value}"`;
    }
}

//
// Server messages
//

export class SVC_Print extends NetMessage {
    text: string;

    constructor() {
        super();

        this.setName("Print");
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            this.text = reader.readString();
        } catch (error) {
            console.log(error);
            return false;
        }
        return true;
    }

    toString() {
        return `${this.getName()}: "${this.text}"`;
    }
}

export class SVC_ServerInfo extends NetMessage {
    protocol: number;       // protocol version
    serverCount: number;    // number of changelevels since server start
    isDedicated: boolean;   // dedicated server ?	
    isHLTV: boolean;        // HLTV server ?
    OS: string;             // charCode: 'L' = Linux, 'W' = Windows
    mapCRC: number;         // server map CRC
    clientCRC: number;      // client.dll CRC server is using
    maxClients: number;     // max clients on server
    maxClasses: number;     // max server classes
    playerSlot: number;     // our player slot
    tickInterval: number;   // server tick interval
    gameDir: string;        // game dir eg "tf2"
    mapName: string;        // current map name
    skyName: string;        // current skybox name
    hostName: string;       // server name

    constructor() {
        super();

        this.setName("ServerInfo");
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            this.protocol = reader.readBitsUint(16);
            this.serverCount = reader.readBitsUint(32);
            this.isHLTV = reader.readOneBit();
            this.isDedicated = reader.readOneBit();
            this.clientCRC = reader.readBitsUint(32);
            this.maxClasses = reader.readWord();
            this.mapCRC = reader.readBitsUint(32);
            this.playerSlot = reader.readBitsUint(8);
            this.maxClients = reader.readBitsUint(8);
            this.tickInterval = reader.readFloatBits(32);
            this.OS = String.fromCharCode(reader.readBitsUint(8));
            this.gameDir = reader.readString();
            this.mapName = reader.readString();
            this.skyName = reader.readString();
            this.hostName = reader.readString();
        } catch (error) {
            console.log(error);
            return false;
        }

        return true;
    }

    toString() {
        return `${this.getName()}: game '${this.gameDir}', map '${this.mapName}', max ${this.maxClients}`;
    }
}

export class SVC_SetPause extends NetMessage {
    paused: boolean;

    constructor() {
        super();

        this.setName("SetPause");
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            this.paused = reader.readOneBit();
        } catch (error) {
            console.log(error);
            return false;
        }
        return true;
    }

    toString() {
        return `${this.getName()}: ${this.paused ? "paused" : "unpaused"}`;
    }
}

export class SVC_VoiceData extends NetMessage {
    length: number;
    dataIn: BinaryReader;
    dataOut: BinaryWriter;

    constructor() {
        super();

        this.setName("VoiceData");
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            this.length = reader.readWord();
            // make a copy of reader to dataIn
            var buff = Buffer.alloc(reader.getSize());
            reader.copy(buff, 0);
            this.dataIn = new BinaryReader(buff);
            this.dataIn.seek(reader.getOffset(), SeekOrigin.Begin);
            // make packet reader skip past remaining data
            reader.seek(this.length, SeekOrigin.Current);
        } catch (error) {
            console.log(error);
            return false;
        }
        return true;
    }

    toString() {
        return `${this.getName()}: bytes ${this.length}}`;
    }
}

export class SVC_GameEventList extends NetMessage {
    numEvents: number;
    length: number;
    dataIn: BinaryReader;
    dataOut: BinaryWriter;

    constructor() {
        super();

        this.setName("GameEventList");
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            this.numEvents = reader.readBitsUint(MAX_EVENT_BITS);
            this.length = reader.readBitsUint(20);
            // make a copy of reader to dataIn
            var buff = Buffer.alloc(reader.getSize());
            reader.copy(buff, 0);
            this.dataIn = new BinaryReader(buff);
            this.dataIn.seek(reader.getOffset(), SeekOrigin.Begin);
            // make packet reader skip past remaining data
            reader.seek(this.length, SeekOrigin.Current);
        } catch (error) {
            console.log(error);
            return false;
        }
        return true;
    }

    toString() {
        return `${this.getName()}: number ${this.numEvents}, bytes ${this.length}}`;
    }
}

//
// Client messages
//

export class CLC_Move extends NetMessage {
    backUpCommands: number;
    newCommands: number;
    length: number;
    dataIn: BinaryReader;
    dataOut: BinaryWriter;

    constructor() {
        super();

        this.setName("Move");
        this.dataOut = new BinaryWriter();
    }

    readFromBuffer(reader: BinaryReader): boolean {
        try {
            this.newCommands = reader.readBitsUint(NUM_NEW_COMMAND_BITS);
            this.backUpCommands = reader.readBitsUint(NUM_NEW_COMMAND_BITS);
            this.length = reader.readBitsUint(16);
            // make a copy of reader to dataIn
            var buff = Buffer.alloc(reader.getSize());
            reader.copy(buff, 0);
            this.dataIn = new BinaryReader(buff);
            this.dataIn.seek(reader.getOffset(), SeekOrigin.Begin);
            // make packet reader skip past remaining data
            reader.seek(this.length, SeekOrigin.Current);
        } catch (error) {
            console.log(error);
            return false;
        }
        return true;
    }

    writeToBuffer(writer: BinaryWriter): boolean {
        try {
            writer.writeBitsUint(clc_Move, NETMSG_TYPE_BITS);
            this.length = this.dataOut.getOffset();
            writer.writeBitsUint(this.newCommands, NUM_NEW_COMMAND_BITS);
            writer.writeBitsUint(this.backUpCommands, NUM_NEW_COMMAND_BITS);
            writer.writeBitsUint(this.length, 16);
            writer.writeBits(this.dataOut.getBits());
        } catch (error) {
            console.log(error);
            return false;
        }
        return true;
    }

    toString() {
        return `${this.getName()}: backup ${this.backUpCommands}, new ${this.newCommands}, bits: ${this.length}`;
    }
}