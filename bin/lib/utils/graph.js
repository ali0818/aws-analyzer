"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Node = exports.Tree = void 0;
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
        return { name: this.name, details: this.details, children: children };
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
}
exports.Node = Node;
//# sourceMappingURL=graph.js.map