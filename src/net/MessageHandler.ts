import { BinaryReader, SeekOrigin } from "../BinaryReader";
import { NetMessage, SVC_ServerInfo, SVC_SetPause, NET_Tick, NET_SetConvar, SVC_GameEventList, SVC_VoiceData, SVC_Print } from "./NetMessage";
import { net_NOP, net_Disconnect, net_File, svc_ServerInfo, NETMSG_TYPE_BITS, svc_SetPause, net_Tick, net_SetConVar, svc_GameEventList, svc_VoiceData, svc_Print } from "./Protocol";
import { errorWithTime, logWithTime } from "../Util";
import { NetChan } from "./NetChan";
import * as lzjs from "lzjs";

export class MessageHandler {
    channel: NetChan;
    paused: boolean;

    constructor(channel: NetChan) {
        this.channel = channel;
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
                    errorWithTime(`STVClient.net.MessageHandler.processMessage(): failed processing control message ${msgType}`);
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

                if (!this.process(netMsg, msgType)) {
                    throw (`STVClient.net.MessageHandler.processMessage(): failed processing message ${netMsg.getName()}`);
                }

            } else {
                errorWithTime(`STVClient.net.MessageHandler.processMessage(): Unknown net message ${msgType}`);
                return false;
            }
        }

        return true;
    }

    process(msg: NetMessage, type: number): boolean {
        switch (type) {
            case net_Tick:
                this.channel.hostFrameTime = (msg as NET_Tick).hostFrameTime;
                this.channel.hostFrameTimeStdDeviation = (msg as NET_Tick).hostFrameTimeStdDeviation;
                return this.updateAcknowledgedFramecount((msg as NET_Tick).tick);

            case svc_Print:
                console.log(msg.toString());
                return true;

            case svc_SetPause:
                this.paused = (msg as SVC_SetPause).paused;
                return true;
        }

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
            case net_Tick:
                return new NET_Tick();

            case net_SetConVar:
                return new NET_SetConvar();

            case svc_ServerInfo:
                return new SVC_ServerInfo();

            case svc_SetPause:
                return new SVC_SetPause();

            case svc_VoiceData:
                return new SVC_VoiceData();

            case svc_GameEventList:
                return new SVC_GameEventList();

            default:
                return null;
        }
    }

    updateAcknowledgedFramecount(tick: number): boolean {
        return false;
    }
}