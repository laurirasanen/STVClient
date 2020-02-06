import { BinaryReader } from "../BinaryReader";
import { NetMessage, SVC_ServerInfo } from "./NetMessage";
import { net_NOP, net_Disconnect, net_File, svc_ServerInfo, NETMSG_TYPE_BITS } from "./Protocol";
import { errorWithTime, logWithTime } from "../Util";

export class MessageHandler {
    constructor() {

    }

    // https://github.com/VSES/SourceEngine2007/blob/master/se2007/engine/net_chan.cpp#L1821
    processMessages(reader: BinaryReader): boolean {
        while (true) {
            if (reader.getRemaining() < NETMSG_TYPE_BITS) {
                // finished reading
                break;
            }

            var msgType = reader.readBitsUint(5);

            console.log(`Read message type ${msgType}`);

            if (msgType <= net_File) {
                if (!this.processControlMessage(msgType, reader)) {
                    return false;
                }

                continue;
            }

            var netMsg = this.findMessage(msgType);

            if (netMsg) {
                if (!netMsg.readFromBuffer(reader)) {
                    errorWithTime(`STVClient.net.MessageHandler.processMessage(): failed reading message ${netMsg.getName()}`);
                    return false;
                }

                logWithTime(`STVClient.net.MessageHandler.processMessage(): Received message ${netMsg.getName()}`);
                console.log(netMsg.toString());

                if (!this.process(netMsg)) {
                    throw (`STVClient.net.MessageHandler.processMessage(): failed processing message ${netMsg.getName()}`);
                }

            } else {
                errorWithTime(`STVClient.net.MessageHandler.processMessage(): Unknown net message ${msgType}`);
                return false;
            }
        }

        return true;
    }

    process(msg: NetMessage): boolean {
        return false;
    }

    processControlMessage(type: number, reader: BinaryReader): boolean {
        if (type === net_NOP) {
            return true;
        }

        if (type === net_Disconnect) {
            // TODO: disconnect
            return false;
        }

        if (type === net_File) {
            return false;
        }

        throw (`STVClient.net.MessageHandler.processControlMessage() called with illegal type ${type}`);
    }

    findMessage(type: number): NetMessage {
        switch (type) {
            case svc_ServerInfo:
                return new SVC_ServerInfo();
            
            default:
                return null;
        }
    }
}