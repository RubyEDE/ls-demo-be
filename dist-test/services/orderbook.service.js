"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateOrderBook = getOrCreateOrderBook;
exports.addToOrderBook = addToOrderBook;
exports.removeFromOrderBook = removeFromOrderBook;
exports.getOrderBookSnapshot = getOrderBookSnapshot;
exports.getBestBid = getBestBid;
exports.getBestAsk = getBestAsk;
exports.getSpread = getSpread;
exports.clearOrderBook = clearOrderBook;
exports.rebuildOrderBook = rebuildOrderBook;
exports.loadOrderBookFromDB = loadOrderBookFromDB;
exports.broadcastOrderBook = broadcastOrderBook;
var order_model_1 = require("../models/order.model");
var websocket_service_1 = require("./websocket.service");
var orderBooks = new Map();
/**
 * Initialize or get an order book for a market
 */
function getOrCreateOrderBook(marketSymbol) {
    var symbol = marketSymbol.toUpperCase();
    if (!orderBooks.has(symbol)) {
        orderBooks.set(symbol, {
            symbol: symbol,
            bids: new Map(),
            asks: new Map(),
            lastUpdate: Date.now(),
        });
    }
    return orderBooks.get(symbol);
}
/**
 * Add an order to the in-memory order book
 */
function addToOrderBook(order) {
    var book = getOrCreateOrderBook(order.marketSymbol);
    var side = order.side === "buy" ? book.bids : book.asks;
    var existing = side.get(order.price);
    if (existing) {
        existing.quantity += order.remainingQuantity;
        existing.orderCount += 1;
    }
    else {
        side.set(order.price, {
            price: order.price,
            quantity: order.remainingQuantity,
            orderCount: 1,
        });
    }
    book.lastUpdate = Date.now();
    // Broadcast update
    (0, websocket_service_1.broadcastOrderBookUpdate)(order.marketSymbol, {
        symbol: order.marketSymbol,
        side: order.side === "buy" ? "bid" : "ask",
        price: order.price,
        quantity: side.get(order.price).quantity,
        timestamp: book.lastUpdate,
    });
}
/**
 * Remove quantity from the order book
 */
function removeFromOrderBook(marketSymbol, side, price, quantity) {
    var book = getOrCreateOrderBook(marketSymbol);
    var bookSide = side === "buy" ? book.bids : book.asks;
    var level = bookSide.get(price);
    if (level) {
        level.quantity -= quantity;
        level.orderCount -= 1;
        if (level.quantity <= 0 || level.orderCount <= 0) {
            bookSide.delete(price);
        }
        book.lastUpdate = Date.now();
        // Broadcast update
        (0, websocket_service_1.broadcastOrderBookUpdate)(marketSymbol, {
            symbol: marketSymbol,
            side: side === "buy" ? "bid" : "ask",
            price: price,
            quantity: level.quantity > 0 ? level.quantity : 0,
            timestamp: book.lastUpdate,
        });
    }
}
/**
 * Get order book snapshot
 */
function getOrderBookSnapshot(marketSymbol, depth) {
    if (depth === void 0) { depth = 20; }
    var book = getOrCreateOrderBook(marketSymbol);
    // Convert bids to sorted array (descending by price)
    var bids = Array.from(book.bids.values())
        .sort(function (a, b) { return b.price - a.price; })
        .slice(0, depth)
        .map(function (level) { return ({
        price: level.price,
        quantity: level.quantity,
        total: level.price * level.quantity,
    }); });
    // Convert asks to sorted array (ascending by price)
    var asks = Array.from(book.asks.values())
        .sort(function (a, b) { return a.price - b.price; })
        .slice(0, depth)
        .map(function (level) { return ({
        price: level.price,
        quantity: level.quantity,
        total: level.price * level.quantity,
    }); });
    return {
        symbol: marketSymbol,
        bids: bids,
        asks: asks,
        timestamp: book.lastUpdate,
    };
}
/**
 * Get best bid price
 */
function getBestBid(marketSymbol) {
    var book = getOrCreateOrderBook(marketSymbol);
    if (book.bids.size === 0)
        return null;
    return Math.max.apply(Math, Array.from(book.bids.keys()));
}
/**
 * Get best ask price
 */
function getBestAsk(marketSymbol) {
    var book = getOrCreateOrderBook(marketSymbol);
    if (book.asks.size === 0)
        return null;
    return Math.min.apply(Math, Array.from(book.asks.keys()));
}
/**
 * Get spread
 */
function getSpread(marketSymbol) {
    var bid = getBestBid(marketSymbol);
    var ask = getBestAsk(marketSymbol);
    return {
        bid: bid,
        ask: ask,
        spread: bid && ask ? ask - bid : null,
    };
}
/**
 * Clear the order book for a market
 */
function clearOrderBook(marketSymbol) {
    var symbol = marketSymbol.toUpperCase();
    orderBooks.delete(symbol);
}
/**
 * Rebuild order book from database (includes both user and synthetic orders)
 * This preserves user orders when refreshing synthetic liquidity
 */
function rebuildOrderBook(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, orders, _i, orders_1, order;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    // Clear existing in-memory book
                    clearOrderBook(symbol);
                    return [4 /*yield*/, order_model_1.Order.find({
                            marketSymbol: symbol,
                            status: { $in: ["open", "partial"] },
                        })];
                case 1:
                    orders = _a.sent();
                    for (_i = 0, orders_1 = orders; _i < orders_1.length; _i++) {
                        order = orders_1[_i];
                        addToOrderBook(order);
                    }
                    console.log("\uD83D\uDCDA Rebuilt order book for ".concat(symbol, ": ").concat(orders.length, " orders (user + synthetic)"));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Load order book from database
 */
function loadOrderBookFromDB(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, orders, _i, orders_2, order;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    // Clear existing in-memory book
                    clearOrderBook(symbol);
                    return [4 /*yield*/, order_model_1.Order.find({
                            marketSymbol: symbol,
                            status: { $in: ["open", "partial"] },
                        })];
                case 1:
                    orders = _a.sent();
                    for (_i = 0, orders_2 = orders; _i < orders_2.length; _i++) {
                        order = orders_2[_i];
                        addToOrderBook(order);
                    }
                    console.log("\uD83D\uDCDA Loaded ".concat(orders.length, " orders for ").concat(symbol, " order book"));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Broadcast full order book snapshot
 */
function broadcastOrderBook(marketSymbol, depth) {
    if (depth === void 0) { depth = 20; }
    var snapshot = getOrderBookSnapshot(marketSymbol, depth);
    (0, websocket_service_1.broadcastOrderBookSnapshot)(marketSymbol, snapshot);
}
