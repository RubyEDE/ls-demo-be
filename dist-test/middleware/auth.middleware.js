"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
var token_service_1 = require("../services/token.service");
function authMiddleware(req, res, next) {
    var authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({
            error: "UNAUTHORIZED",
            message: "Authorization header is required",
        });
        return;
    }
    var _a = authHeader.split(" "), bearer = _a[0], token = _a[1];
    if (bearer !== "Bearer" || !token) {
        res.status(401).json({
            error: "INVALID_TOKEN_FORMAT",
            message: "Authorization header must be in format: Bearer <token>",
        });
        return;
    }
    var payload = (0, token_service_1.verifyToken)(token);
    if (!payload) {
        res.status(401).json({
            error: "INVALID_TOKEN",
            message: "Token is invalid or expired",
        });
        return;
    }
    req.auth = payload;
    next();
}
