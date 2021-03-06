export function timeStamp(): string {
    var date = new Date(Date.now());
    var hours: number | string = date.getHours();
    var minutes: number | string = date.getMinutes();
    var seconds: number | string = date.getSeconds();
    var millis: number | string = date.getMilliseconds();

    if (hours < 10)
        hours = "0" + hours;

    if (minutes < 10)
        minutes = "0" + minutes;

    if (seconds < 10)
        seconds = "0" + seconds;

    if (millis < 10)
        millis = "0" + millis;

    if (millis < 100)
        millis = "0" + millis;

    return `${hours}:${minutes}:${seconds}.${millis}`;
}

export function logWithTime(text: string) {
    console.log(`[${timeStamp()}] ${text}`);
}

export function warnWithTime(text: string) {
    console.warn(`[${timeStamp()}] ${text}`);
}

export function errorWithTime(text: string) {
    console.error(`[${timeStamp()}] ${text}`);
}

export function padNumber(value: number, multiple: number) {
    return value + (multiple - (value % multiple)) % multiple;
}

/**
 * Generate random int with inclusive bounds
 * @param {number} min - inclusive
 * @param {number} max - inclusive
 * @returns {number}
 */
export function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}