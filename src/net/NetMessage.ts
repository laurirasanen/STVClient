import { BinaryReader } from "../BinaryReader";

export class NetMessage {
    name: string;

    readFromBuffer(reader: BinaryReader): boolean {
        return false;
    }

    getName() {
        return this.name;
    }

    toString() {
        return "NetMessage";
    }
}


//
// Server messages
//

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

        this.name = "ServerInfo";
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
            this.tickInterval = reader.readFloat();
            this.OS = String.fromCharCode(reader.readBitsUint(8));
            this.gameDir = reader.readString();
            this.mapName = reader.readString();
            this.skyName = reader.readString();
            this.hostName = reader.readString();
        } catch (err) {
            console.log(err);
            return false;
        }

        return true;
    }

    toString() {
        return `${this.name}: game '${this.gameDir}', map '${this.mapName}', max ${this.maxClients}`;
    }
}