const STVClient = require("../build/STVClient");

var client = new STVClient.STVClient("tf");
client.connect("192.168.1.99:27020");