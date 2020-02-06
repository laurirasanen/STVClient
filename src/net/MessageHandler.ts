import { BinaryReader } from "../BinaryReader";

export class MessageHandler {
    constructor() {

    }

    handleNetMessage(type: number, reader: BinaryReader) {
        throw("not implemented");
    }
}