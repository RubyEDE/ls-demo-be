"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWebSocket = initializeWebSocket;
exports.getIO = getIO;
exports.broadcastPriceUpdate = broadcastPriceUpdate;
exports.broadcastPriceBatch = broadcastPriceBatch;
exports.broadcastOrderBookSnapshot = broadcastOrderBookSnapshot;
exports.broadcastOrderBookUpdate = broadcastOrderBookUpdate;
exports.broadcastTradeExecuted = broadcastTradeExecuted;
exports.broadcastCandleUpdate = broadcastCandleUpdate;
exports.sendOrderUpdate = sendOrderUpdate;
exports.sendBalanceUpdate = sendBalanceUpdate;
exports.sendPositionUpdate = sendPositionUpdate;
exports.sendPositionOpened = sendPositionOpened;
exports.getSubscriptionCount = getSubscriptionCount;
exports.getActiveChannels = getActiveChannels;
var socket_io_1 = require("socket.io");
var jsonwebtoken_1 = require("jsonwebtoken");
var env_1 = require("../config/env");
// Socket.IO server instance
var io = null;
// Track subscriptions
var subscriptions = new Map(); // channel -> Set<socketId>
/**
 * Initialize WebSocket server
 */
function initializeWebSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });
    // Authentication middleware
    io.use(function (socket, next) {
        var _a;
        var token = socket.handshake.auth.token || ((_a = socket.handshake.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", ""));
        if (!token) {
            // Allow unauthenticated connections for public data
            socket.data.authenticated = false;
            return next();
        }
        try {
            var payload = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
            socket.data.userId = payload.address;
            socket.data.address = payload.address;
            socket.data.authenticated = true;
            next();
        }
        catch (_b) {
            socket.data.authenticated = false;
            next();
        }
    });
    io.on("connection", function (socket) {
        console.log("\uD83D\uDCE1 WebSocket connected: ".concat(socket.id, " (authenticated: ").concat(socket.data.authenticated, ")"));
        // Join user-specific room if authenticated
        if (socket.data.authenticated && socket.data.address) {
            socket.join("user:".concat(socket.data.address.toLowerCase()));
        }
        // Handle price subscriptions
        socket.on("subscribe:price", function (symbol) {
            var channel = "price:".concat(symbol.toUpperCase());
            socket.join(channel);
            addSubscription(channel, socket.id);
            socket.emit("subscribed", { channel: "price", symbol: symbol.toUpperCase() });
            console.log("\uD83D\uDCCA ".concat(socket.id, " subscribed to ").concat(channel));
        });
        socket.on("unsubscribe:price", function (symbol) {
            var channel = "price:".concat(symbol.toUpperCase());
            socket.leave(channel);
            removeSubscription(channel, socket.id);
            socket.emit("unsubscribed", { channel: "price", symbol: symbol.toUpperCase() });
        });
        // Handle order book subscriptions
        socket.on("subscribe:orderbook", function (symbol) {
            var channel = "orderbook:".concat(symbol.toUpperCase());
            socket.join(channel);
            addSubscription(channel, socket.id);
            socket.emit("subscribed", { channel: "orderbook", symbol: symbol.toUpperCase() });
            console.log("\uD83D\uDCDA ".concat(socket.id, " subscribed to ").concat(channel));
        });
        socket.on("unsubscribe:orderbook", function (symbol) {
            var channel = "orderbook:".concat(symbol.toUpperCase());
            socket.leave(channel);
            removeSubscription(channel, socket.id);
            socket.emit("unsubscribed", { channel: "orderbook", symbol: symbol.toUpperCase() });
        });
        // Handle trade subscriptions
        socket.on("subscribe:trades", function (symbol) {
            var channel = "trades:".concat(symbol.toUpperCase());
            socket.join(channel);
            addSubscription(channel, socket.id);
            socket.emit("subscribed", { channel: "trades", symbol: symbol.toUpperCase() });
            console.log("\uD83D\uDCB9 ".concat(socket.id, " subscribed to ").concat(channel));
        });
        socket.on("unsubscribe:trades", function (symbol) {
            var channel = "trades:".concat(symbol.toUpperCase());
            socket.leave(channel);
            removeSubscription(channel, socket.id);
            socket.emit("unsubscribed", { channel: "trades", symbol: symbol.toUpperCase() });
        });
        // Handle candle subscriptions
        socket.on("subscribe:candles", function (data) {
            // Handle both object and string formats
            var symbol;
            var interval;
            if (typeof data === "string") {
                symbol = data.toUpperCase();
                interval = "1m";
            }
            else if (data && data.symbol) {
                symbol = data.symbol.toUpperCase();
                interval = data.interval || "1m";
            }
            else {
                socket.emit("error", { code: "INVALID_REQUEST", message: "Invalid subscription: symbol is required" });
                return;
            }
            var channel = "candles:".concat(symbol, ":").concat(interval);
            socket.join(channel);
            addSubscription(channel, socket.id);
            socket.emit("subscribed", { channel: "candles", symbol: symbol, interval: interval });
            console.log("\uD83D\uDCCA ".concat(socket.id, " subscribed to ").concat(channel));
        });
        socket.on("unsubscribe:candles", function (data) {
            var symbol;
            var interval;
            if (typeof data === "string") {
                symbol = data.toUpperCase();
                interval = "1m";
            }
            else if (data && data.symbol) {
                symbol = data.symbol.toUpperCase();
                interval = data.interval || "1m";
            }
            else {
                socket.emit("error", { code: "INVALID_REQUEST", message: "Invalid unsubscription: symbol is required" });
                return;
            }
            var channel = "candles:".concat(symbol, ":").concat(interval);
            socket.leave(channel);
            removeSubscription(channel, socket.id);
            socket.emit("unsubscribed", { channel: "candles", symbol: symbol, interval: interval });
        });
        // Handle disconnection
        socket.on("disconnect", function (reason) {
            console.log("\uD83D\uDCE1 WebSocket disconnected: ".concat(socket.id, " (").concat(reason, ")"));
            // Clean up subscriptions
            subscriptions.forEach(function (sockets, channel) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    subscriptions.delete(channel);
                }
            });
        });
    });
    return io;
}
/**
 * Get the Socket.IO server instance
 */
function getIO() {
    return io;
}
/**
 * Broadcast price update to subscribers
 */
function broadcastPriceUpdate(symbol, data) {
    if (!io)
        return;
    io.to("price:".concat(symbol.toUpperCase())).emit("price:update", data);
}
/**
 * Broadcast batch price updates
 */
function broadcastPriceBatch(updates) {
    if (!io)
        return;
    // Group by symbol and send to respective rooms
    var bySymbol = new Map();
    updates.forEach(function (update) {
        var key = update.symbol.toUpperCase();
        if (!bySymbol.has(key)) {
            bySymbol.set(key, []);
        }
        bySymbol.get(key).push(update);
    });
    bySymbol.forEach(function (symbolUpdates, symbol) {
        io.to("price:".concat(symbol)).emit("price:batch", symbolUpdates);
    });
}
/**
 * Broadcast order book snapshot
 */
function broadcastOrderBookSnapshot(symbol, data) {
    if (!io)
        return;
    io.to("orderbook:".concat(symbol.toUpperCase())).emit("orderbook:snapshot", data);
}
/**
 * Broadcast order book update
 */
function broadcastOrderBookUpdate(symbol, data) {
    if (!io)
        return;
    io.to("orderbook:".concat(symbol.toUpperCase())).emit("orderbook:update", data);
}
/**
 * Broadcast trade execution
 */
function broadcastTradeExecuted(symbol, data) {
    if (!io)
        return;
    io.to("trades:".concat(symbol.toUpperCase())).emit("trade:executed", data);
}
/**
 * Broadcast candle update
 */
function broadcastCandleUpdate(symbol, data) {
    if (!io)
        return;
    var channel = "candles:".concat(symbol.toUpperCase(), ":").concat(data.interval);
    io.to(channel).emit("candle:update", data);
}
/**
 * Send user-specific order update
 */
function sendOrderUpdate(userAddress, event, data) {
    if (!io)
        return;
    io.to("user:".concat(userAddress.toLowerCase())).emit(event, data);
}
/**
 * Send user-specific balance update
 */
function sendBalanceUpdate(userAddress, data) {
    if (!io)
        return;
    io.to("user:".concat(userAddress.toLowerCase())).emit("balance:updated", data);
}
/**
 * Send user-specific position update
 */
function sendPositionUpdate(userAddress, data) {
    if (!io)
        return;
    var room = "user:".concat(userAddress.toLowerCase());
    // Send appropriate event based on status
    if (data.status === "closed") {
        io.to(room).emit("position:closed", data);
    }
    else if (data.status === "liquidated") {
        io.to(room).emit("position:liquidated", data);
    }
    else if (data.size > 0) {
        io.to(room).emit("position:updated", data);
    }
    // Always send the general update
    io.to(room).emit("position:updated", data);
}
/**
 * Send position opened event
 */
function sendPositionOpened(userAddress, data) {
    if (!io)
        return;
    io.to("user:".concat(userAddress.toLowerCase())).emit("position:opened", data);
}
/**
 * Get active subscriptions for a channel
 */
function getSubscriptionCount(channel) {
    var _a;
    return ((_a = subscriptions.get(channel)) === null || _a === void 0 ? void 0 : _a.size) || 0;
}
/**
 * Get all active channels
 */
function getActiveChannels() {
    return Array.from(subscriptions.keys());
}
// Helper functions
function addSubscription(channel, socketId) {
    if (!subscriptions.has(channel)) {
        subscriptions.set(channel, new Set());
    }
    subscriptions.get(channel).add(socketId);
}
function removeSubscription(channel, socketId) {
    var sockets = subscriptions.get(channel);
    if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
            subscriptions.delete(channel);
        }
    }
}
