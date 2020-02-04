import { NetChan } from "./net/NetChan";
import { MessageHandler } from "./net/MessageHandler";

export class STVClient {
    messageHandler: MessageHandler;
    readonly name = "STVClient";

    constructor(address: string, password = "") {
        this.messageHandler = new MessageHandler(address, password, this.name);
    }
}
