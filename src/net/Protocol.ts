export const CD_KEY = "HLTVHLTVHLTVHLTVHLTVHLTVHLTVHLTV";
export const PROTOCOL_VERSION = 24;
export const GAME_VERSION_TF = 5615298;
export const MAX_SUBCHANNELS = 8;
export const MAX_STREAMS = 2;

export const FRAGMENT_BITS = 8;
export const FRAGMENT_SIZE = 1 << FRAGMENT_BITS;
export const BYTES2FRAGMENTS = (x) => { return (x + FRAGMENT_SIZE - 1) / FRAGMENT_SIZE; };
export const MAX_FILE_SIZE_BITS = 26;

export const SUBCHANNEL_FREE = 0;
export const SUBCHANNEL_TOSEND = 1;
export const SUBCHANNEL_WAITING = 2;
export const SUBCHANNEL_DIRTY = 3;

export const FLIPBIT = (v, b) => { if (v & b) v &= ~b; else v |= b };

// M = master, S = server, C = client, A = any

// Client / ANY to SERVER
export const C2S_CONNECT = 'k'.charCodeAt(0);
export const A2S_GETCHALLENGE = 'q'.charCodeAt(0);

// SERVER to CLIENT / ANY
// TODO: make these into enum?
export const S2C_CHALLENGE = 'A'.charCodeAt(0);
export const S2C_CONNECTION = 'B'.charCodeAt(0);
export const S2C_REDIRECT = 'L'.charCodeAt(0);
export const S2C_CONNREJECT = '9'.charCodeAt(0);

// Response to server info requests
export const S2A_INFO_DETAILED = 'm'.charCodeAt(0);


export const NET_MAX_PAYLOAD = 96000;	// largest message we can send in bytes
export const NET_MAX_PALYLOAD_BITS = 17;		// 2^NET_MAX_PALYLOAD_BITS > NET_MAX_PAYLOAD
// This is just the client_t->netchan.datagram buffer size (shouldn't ever need to be huge)
export const NET_MAX_DATAGRAM_PAYLOAD = 4000;	// = maximum unreliable playload size

// UDP has 28 byte headers
export const UDP_HEADER_SIZE = (20 + 8);	// IP = 20, UDP = 8


export const MAX_ROUTABLE_PAYLOAD = 1260;	// Matches x360 size


export const MIN_ROUTABLE_PAYLOAD = 16;		// minimum playload size

export const NETMSG_TYPE_BITS = 5;	// must be 2^NETMSG_TYPE_BITS > SVC_LASTMSG

// This is the payload plus any header info (excluding UDP header)

export const HEADER_BYTES = 9;	// 2*4 bytes seqnr, 1 byte flags

// Pad this to next higher 16 byte boundary
// This is the largest packet that can come in/out over the wire, before processing the header
//  bytes will be stripped by the networking channel layer
//export const	NET_MAX_MESSAGE	= PAD_NUMBER( ( NET_MAX_PAYLOAD + HEADER_BYTES ), 16 );

export const NET_HEADER_FLAG_SPLITPACKET = -2;
export const NET_HEADER_FLAG_COMPRESSEDPACKET = -3;


// Used to classify entity update types in DeltaPacketEntities.
export enum UpdateType {
    EnterPVS = 0,	// Entity came back into pvs, create new entity if one doesn't exist

    LeavePVS,		// Entity left pvs

    DeltaEnt,		// There is a delta for this entity.
    PreserveEnt,	// Entity stays alive but no delta ( could be LOD, or just unchanged )

    Finished,		// finished parsing entities successfully
    Failed,			// parsing error occured while reading entities
};

// Flags for delta encoding header
export enum DeltaType {
    FHDR_ZERO = 0x0000,
    FHDR_LEAVEPVS = 0x0001,
    FHDR_DELETE = 0x0002,
    FHDR_ENTERPVS = 0x0004,
};



export const INSTANCE_BASELINE_TABLENAME = "instancebaseline";
export const LIGHT_STYLES_TABLENAME = "lightstyles";
export const USER_INFO_TABLENAME = "userinfo";
export const SERVER_STARTUP_DATA_TABLENAME = "server_query_info";	// the name is a remnant...


//export const CURRENT_PROTOCOL    = 1;


export const DELTA_OFFSET_BITS = 5;
export const DELTA_OFFSET_MAX = ((1 << DELTA_OFFSET_BITS) - 1);

export const DELTASIZE_BITS = 20;	// must be: 2^DELTASIZE_BITS > (NET_MAX_PAYLOAD * 8)

// Largest # of commands to send in a packet
export const NUM_NEW_COMMAND_BITS = 4;
export const MAX_NEW_COMMANDS = ((1 << NUM_NEW_COMMAND_BITS) - 1);

// Max number of history commands to send ( 2 by default ) in case of dropped packets
export const NUM_BACKUP_COMMAND_BITS = 3;
export const MAX_BACKUP_COMMANDS = ((1 << NUM_BACKUP_COMMAND_BITS) - 1);


export const PROTOCOL_AUTHCERTIFICATE = 0x01;   // Connection from client is using a WON authenticated certificate
export const PROTOCOL_HASHEDCDKEY = 0x02;	// Connection from client is using hashed CD key because WON comm. channel was unreachable
export const PROTOCOL_STEAM = 0x03;	// Steam certificates
export const PROTOCOL_LASTVALID = 0x03;    // Last valid protocol

export const CONNECTIONLESS_HEADER = 0xFFFFFFFF;	// all OOB packet start with this sequence
export const STEAM_KEYSIZE = 2048;  // max size needed to contain a steam authentication key (both server and client)

// each channel packet has 1 byte of FLAG bits
export const PACKET_FLAG_RELIABLE = (1 << 0);	// packet contains subchannel stream data
export const PACKET_FLAG_COMPRESSED = (1 << 1);	// packet is compressed
export const PACKET_FLAG_ENCRYPTED = (1 << 2); // packet is encrypted
export const PACKET_FLAG_SPLIT = (1 << 3); // packet is split
export const PACKET_FLAG_CHOKED = (1 << 4);  // packet was choked by sender

// NOTE:  Bits 5, 6, and 7 are used to specify the # of padding bits at the end of the packet!!!
export const ENCODE_PAD_BITS = (x) => { return ((x << 5) & 0xff); }
export const DECODE_PAD_BITS = (x) => { return ((x >> 5) & 0xff); }

// shared commands used by all streams, handled by stream layer, TODO

export const net_NOP = 0;		// nop command used for padding
export const net_Disconnect = 1;		// disconnect, last message in connection
export const net_File = 2;		// file transmission message request/deny

export const net_Tick = 3;		// send last world tick
export const net_StringCmd = 4;		// a string command
export const net_SetConVar = 5;		// sends one/multiple convar settings
export const net_SignonState = 6;			// signals current signon state

//
// server to client
//

export const svc_Print = 7;	// print text to console
export const svc_ServerInfo = 8;	// first message from server about game, map etc
export const svc_SendTable = 9;	// sends a sendtable description for a game class
export const svc_ClassInfo = 10;	// Info about classes (first byte is a CLASSINFO_ define).
export const svc_SetPause = 11;		// tells client if server paused or unpaused


export const svc_CreateStringTable = 12;	// inits shared string tables
export const svc_UpdateStringTable = 13;	// updates a string table

export const svc_VoiceInit = 14;	// inits used voice codecs & quality
export const svc_VoiceData = 15;	// Voicestream data from the server

// export const svc_HLTV = 16;	// HLTV control messages

export const svc_Sounds = 17;		// starts playing sound

export const svc_SetView = 18;	// sets entity as point of view
export const svc_FixAngle = 19;	// sets/corrects players viewangle
export const svc_CrosshairAngle = 20;	// adjusts crosshair in auto aim mode to lock on traget

export const svc_BSPDecal = 21;		// add a static decal to the worl BSP
// NOTE: This is now unused!
//export const	svc_TerrainMod		=22;		// modification to the terrain/displacement

// Message from server side to client side entity
export const svc_UserMessage = 23;	// a game specific message
export const svc_EntityMessage = 24;	// a message for an entity
export const svc_GameEvent = 25;	// global game event fired

export const svc_PacketEntities = 26;  // non-delta compressed entities

export const svc_TempEntities = 27;	// non-reliable event object

export const svc_Prefetch = 28;	// only sound indices for now

export const svc_Menu = 29;	// display a menu from a plugin

export const svc_GameEventList = 30;	// list of known games events and fields

export const svc_GetCvarValue = 31;	// Server wants to know the value of a cvar on the client.

export const SVC_LASTMSG = 31;	// last known server messages

//
// client to server
//

export const clc_ClientInfo = 8;	// client info (table CRC etc)
export const clc_Move = 9;	// [CUserCmd]
export const clc_VoiceData = 10;   // Voicestream data from a client
export const clc_BaselineAck = 11;	// client acknowledges a new baseline seqnr
export const clc_ListenEvents = 12;	// client acknowledges a new baseline seqnr
export const clc_RespondCvarValue = 13;		// client is responding to a svc_GetCvarValue message.
export const clc_FileCRCCheck = 14;		// client is sending a file's CRC to the server to be verified.

export const CLC_LASTMSG = 14;	//	last known client message

export const RES_FATALIFMISSING = (1 << 0);   // Disconnect if we can't get this file.
export const RES_PRELOAD = (1 << 1); // Load on client rather than just reserving name

export const SIGNONSTATE_NONE = 0;// no state yet, about to connect
export const SIGNONSTATE_CHALLENGE = 1;	// client challenging server, all OOB packets
export const SIGNONSTATE_CONNECTED = 2;	// client is connected to server, netchans ready
export const SIGNONSTATE_NEW = 3;	// just got serverinfo and string tables
export const SIGNONSTATE_PRESPAWN = 4;	// received signon buffers
export const SIGNONSTATE_SPAWN = 5;	// ready to receive entity packets
export const SIGNONSTATE_FULL = 6;// we are fully connected, first non-delta packet received
export const SIGNONSTATE_CHANGELEVEL = 7;	// server is changing level, please wait

//
// matchmaking
//

export const mm_Heartbeat = 16;	// send a mm_Heartbeat
export const mm_ClientInfo = 17;	// information about a player
export const mm_JoinResponse = 18;		// response to a matchmaking join request
export const mm_RegisterResponse = 19;	// response to a matchmaking join request
export const mm_Migrate = 20;	// tell a client to migrate
export const mm_Mutelist = 21;	// send mutelist info to other clients
export const mm_Checkpoint = 22;	// game state checkpoints (start, connect, etc)

export const MM_LASTMSG = 22;	// last known matchmaking message

export const BITS_PER_INT = 32;
export const GetBitForBitNum = (bitNum) => {
    const bitsForBitNum = [
        (1 << 0),
        (1 << 1),
        (1 << 2),
        (1 << 3),
        (1 << 4),
        (1 << 5),
        (1 << 6),
        (1 << 7),
        (1 << 8),
        (1 << 9),
        (1 << 10),
        (1 << 11),
        (1 << 12),
        (1 << 13),
        (1 << 14),
        (1 << 15),
        (1 << 16),
        (1 << 17),
        (1 << 18),
        (1 << 19),
        (1 << 20),
        (1 << 21),
        (1 << 22),
        (1 << 23),
        (1 << 24),
        (1 << 25),
        (1 << 26),
        (1 << 27),
        (1 << 28),
        (1 << 29),
        (1 << 30),
        (1 << 31),
    ];

    return bitsForBitNum[(bitNum) & (BITS_PER_INT - 1)];
};