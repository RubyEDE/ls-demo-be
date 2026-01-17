"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
exports.getTokenExpiration = getTokenExpiration;
var jsonwebtoken_1 = require("jsonwebtoken");
var env_1 = require("../config/env");
var TOKEN_EXPIRATION_DAYS = 30;
function generateToken(address, chainId) {
    var payload = {
        address: address,
        chainId: chainId,
    };
    return jsonwebtoken_1.default.sign(payload, env_1.config.jwtSecret, {
        expiresIn: env_1.config.jwtExpiresIn,
    });
}
function verifyToken(token) {
    try {
        var decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
        return decoded;
    }
    catch (_a) {
        return null;
    }
}
function getTokenExpiration() {
    return Date.now() + TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;
}
