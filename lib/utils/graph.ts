import * as uuid from 'uuid';

export class Tree {
    constructor(public name: string, root?: Node) { if (root) this.root = root; }

    root: Node;

    setRoot(root: Node) { this.root = root; }

    ///Create a function to get a node which which has the give name
    getNode(name: string): Node {
        return this.root.getChildByName(name);
    }

    toJSON() {
        return (this.root.toJSON());
    }
}

export class Node {
    parent: Node;
    isRoot: boolean = false;
    id: string;
    public children: Node[] = [];
    constructor(public name: string, public details?: any) {
        this.id = uuid.v4();
    }

    addChild(child: Node, isRoot?: boolean) {
        this.children.push(child);
        if (isRoot) child.isRoot = true;
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
    getChildByName(name: string): Node {
        if (this.name === name) return this;
        for (var i = 0; i < this.children.length; i++) {
            var node = this.children[i].getChildByName(name);
            if (node) return node;
        }
        return null;
    }
}