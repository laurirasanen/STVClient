import { NetChan } from "./net/NetChan";

export class STVClient {
    channel: NetChan;
    readonly name = "STVClient";

    constructor(game = "tf") {
        this.channel = new NetChan(this.name, game);
    }

    connect(address: string, password = "") {
        this.channel.connect(address, password);
    }
}
