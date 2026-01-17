"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || "3000", 10),
    jwtSecret: process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production",
    jwtExpiresIn: "30d",
    domain: process.env.DOMAIN || "localhost",
    origin: process.env.ORIGIN || "http://localhost:3000",
    mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/evm-auth",
    finnhubApiKey: process.env.FINNHUB_API_KEY || "",
};
