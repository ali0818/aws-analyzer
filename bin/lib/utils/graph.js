"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Node = exports.Tree = void 0;
const uuid = __importStar(require("uuid"));
class Tree {
    constructor(name, root) {
        this.name = name;
        if (root)
            this.root = root;
    }
    setRoot(root) { this.root = root; }
    ///Create a function to get a node which which has the give name
    getNode(name) {
        return this.root.getChildByName(name);
    }
    toJSON() {
        return (this.root.toJSON());
    }
}
exports.Tree = Tree;
class Node {
    constructor(name, details) {
        this.name = name;
        this.details = details;
        this.isRoot = false;
        this.children = [];
        this.id = uuid.v4();
    }
    addChild(child, isRoot) {
        this.children.push(child);
        if (isRoot)
            child.isRoot = true;
        child.parent = this;
    }
    toJSON() {
        var children = [];
        for (var i = 0; i < this.children.length; i++) {
            children.push(this.children[i].toJSON());
        }
        return { id: this.id, name: this.name, details: this.details, children: children, parent: this.parent ? this.parent.id : '' };
    }
    //Get the node which has the given name
    getChildByName(name) {
        if (this.name === name)
            return this;
        for (var i = 0; i < this.children.length; i++) {
            var node = this.children[i].getChildByName(name);
            if (node)
                return node;
        }
        return null;
    }
    removeNodeByName(name) {
        if (this.name == name) {
            this.parent.children.splice(this.parent.children.indexOf(this), 1);
            return;
        }
        for (var i = 0; i < this.children.length; i++) {
            var node = this.children[i].getChildByName(name);
            if (node) {
                this.children.splice(i, 1);
                return;
            }
        }
    }
    removeNode(node) {
        if (this.children.indexOf(node) > -1) {
            this.children.splice(this.children.indexOf(node), 1);
        }
    }
    calculateTotalChildren() {
        var total = this.children.length;
        for (var i = 0; i < this.children.length; i++) {
            total += this.children[i].calculateTotalChildren();
        }
        return total;
    }
}
exports.Node = Node;
//# sourceMappingURL=graph.js.map