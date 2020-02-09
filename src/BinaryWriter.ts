import { SeekOrigin, BinaryReader } from "./BinaryReader";

export class BinaryWriter {
    private buffer: Buffer;
    private offset: number;

    constructor(size?: number) {
        this.buffer = Buffer.alloc(size || 0);
        this.offset = 0;
    }

    seek(offset: number, origin: SeekOrigin): number {
        switch (origin) {
            case SeekOrigin.Begin:
                return this.offset = offset;
            case SeekOrigin.End:
                return this.offset = this.buffer.byteLength * 8 - offset;
            default:
                return this.offset = this.offset + offset;
        }
    }

    getOffset = (): number => {
        return this.offset;
    }

    getSize = (): number => {
        return this.buffer.byteLength;
    }

    getBuffer = (): Buffer => {
        var buff = Buffer.alloc(this.buffer.byteLength);
        this.buffer.copy(buff);
        return buff;
    }

    getRemaining(): number {
        return this.buffer.byteLength * 8 - this.offset;
    }

    copy = (target: Buffer, offset: number = 0) => {
        for (let i = 0; i < this.buffer.byteLength - offset; i++) {
            target.writeUInt8(this.buffer.readUInt8(i + offset), i);
        }
    }

    extend = (amount: number) => {
        if (amount < this.getSize() * 8 - this.getOffset()) return;

        var bitOffset = amount % 8;
        var unEven = bitOffset > 0;
        var byteLength = this.buffer.byteLength + ((amount - bitOffset) / 8);
        if (unEven) {
            byteLength++;
        }
        var buf = Buffer.alloc(byteLength);
        this.copy(buf);
        this.buffer = buf;
    }

    writeBitsUint(value: number, amount: number) {
        for (let i = 0; i < amount; i++) {
            this.writeOneBit((value & (2 ** i)) > 0);
        }
    }

    writeBits(bits: Array<boolean>) {
        for (let i = 0; i < bits.length; i++) {
            this.writeOneBit(bits[i]);            
        }
    }

    getBits(): Array<boolean> {
        var offset = this.getOffset();
        this.seek(0, SeekOrigin.Begin);
        var bits = this.readBits(this.getRemaining());
        this.seek(offset, SeekOrigin.Begin);
        return bits;
    }

    readOneBit(): boolean {
        var bitOffset = this.offset % 8;
        var byteOffset = (this.offset - bitOffset) / 8;
        var byte = this.buffer.readUInt8(byteOffset);
        this.offset++;
        return ((byte & 2 ** bitOffset) === 2 ** bitOffset);
    }

    readBits(amount: number): Array<boolean> {
        var arr = new Array<boolean>(amount);
        for (let i = 0; i < amount; i++) {
            // this is gonna be terribly inefficient...
            // going to read the same byte from stream
            // 8 times to get 8 bits...
            arr[i] = this.readOneBit();
        }

        return arr;
    }

    writeOneBit(value: boolean) {
        this.extend(1);

        var bitOffset = this.offset % 8;
        var byteOffset = (this.offset - bitOffset) / 8;
        var byte = this.buffer.readUInt8(byteOffset);

        if (value) {
            byte |= 2 ** bitOffset;
        } else {
            byte &= ~(2 ** bitOffset);
        }

        this.buffer.writeUInt8(byte, byteOffset);
        this.offset++;
    }

    writeBoolean = (value: boolean) => {
        this.writeUint8(value ? 1 : 0);
    }

    writeUint8 = (value: number) => {
        if (this.offset % 8) {
            throw ("not aligned to byte");
        }

        this.extend(8);

        this.buffer.writeUInt8(value, this.offset / 8);
        this.offset += 8;
    }

    writeInt32 = (value: number) => {
        if (this.offset % 8) {
            throw ("not aligned to byte");
        }

        this.extend(32);

        this.buffer.writeInt32LE(value, this.offset / 8);
        this.offset += 32;
        return value;
    }

    writeUint16 = (value: number) => {
        if (this.offset % 8) {
            throw ("not aligned to byte");
        }

        this.extend(16);

        this.buffer.writeUInt16LE(value, this.offset / 8);
        this.offset += 16;
        return value;
    }

    writeUint32 = (value: number) => {
        if (this.offset % 8) {
            throw ("not aligned to byte");
        }

        this.extend(32);

        this.buffer.writeUInt32LE(value, this.offset / 8);
        this.offset += 32;
        return value;
    }

    writeUint64 = (value: BigInt) => {
        // Source encodes 64-bit numbers as a pair of 32-bit numbers
        var buff = Buffer.alloc(8);
        buff.writeBigUInt64LE(value as bigint, 0);
        var val1 = buff.readUInt32LE(0);
        var val2 = buff.readUInt32LE(4);

        this.writeUint32(val2);
        this.writeUint32(val1);
    }

    writeFloat32 = (value: number) => {
        if (this.offset % 8) {
            throw ("not aligned to byte");
        }

        this.extend(32);

        this.buffer.writeFloatLE(value, this.offset / 8);
        this.offset += 32;
        return value;
    }

    // http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt

    /* utf.js - UTF-8 <=> UTF-16 convertion
    *
    * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
    * Version: 1.0
    * LastModified: Dec 25 1999
    * This library is free.  You can redistribute it and/or modify it.
    */

    static utf8ArrayToStr(array: number[]): string {
        var out, i, len, c;
        var char2, char3;

        out = "";
        len = array.length;
        i = 0;
        while (i < len) {
            c = array[i++];
            switch (c >> 4) {
                case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                    // 0xxxxxxx
                    out += String.fromCharCode(c);
                    break;
                case 12: case 13:
                    // 110x xxxx   10xx xxxx
                    char2 = array[i++];
                    out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                    break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                    break;
            }
        }

        return out;
    }

    // Write a null-terminated string
    writeString = (value: string) => {
        // extend once instead of every time we write uint
        this.extend(value.length * 8 + 8);

        for (let i = 0; i < value.length; i++) {
            var char = value.charCodeAt(i);
            if (char === NaN) {
                throw (`Illegal character '${value[i]}' at index ${i} of '${value}'`);
            }
            this.writeUint8(char);
        }

        this.writeUint8(0);
    }
}