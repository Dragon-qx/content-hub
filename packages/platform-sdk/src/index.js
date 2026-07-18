"use strict";
// packages/platform-sdk
// Unified platform adapter interface for ContentHub
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./types"), exports);
__exportStar(require("./wechat-official"), exports);
__exportStar(require("./adapter-base"), exports);
__exportStar(require("./adapter-factory"), exports);
__exportStar(require("./adapters/wechat-video"), exports);
__exportStar(require("./adapters/douyin"), exports);
__exportStar(require("./adapters/xiaohongshu"), exports);
__exportStar(require("./adapters/bilibili"), exports);
__exportStar(require("./adapters/weibo"), exports);
__exportStar(require("./adapters/twitter"), exports);
__exportStar(require("./adapters/youtube"), exports);
//# sourceMappingURL=index.js.map