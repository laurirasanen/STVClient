import { NetChan } from "./net/NetChan";
import { MessageHandler } from "./net/MessageHandler";

export class STVClient {
    channel: NetChan;
    readonly name = "STVClient";

    constructor(address: string, password = "") {
        var handler = new MessageHandler();
        this.channel = new NetChan(address, password, this.name, handler);
    }
}
