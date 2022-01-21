"use strict";

let ops = new Map();

function makeOp(signs, arity, apply, diffImpl) {
    function Op(...args) {
        this.args = args;
        this.diffCache = new Map();
    }

    Op.prototype = {};

    Op.prototype.evaluate = function (...vars) { return this.apply(...this.args.map(a => a.evaluate(...vars))) };
    Op.prototype.prefix = function () { return `(${this.signs[0]} ${this.args.map(a => a.prefix()).join(" ")})`};
    Op.prototype.postfix = function () { return `(${this.args.map(a => a.postfix()).join(" ")} ${this.signs[0]})`};
    Op.prototype.toString = function () { return this.args.join(" ") + " " + this.signs[0] };
    Op.prototype.isOperation = true;

    Op.prototype.apply = apply;
    Op.prototype.signs = signs;
    Op.prototype.diffImpl = diffImpl;
    Op.prototype.arity = arity;
    Op.prototype.diff = function (name) {
        if (!this.diffCache.has(name)) {
            this.diffCache.set(name, this.diffImpl(name, this.args.map(a => a.diff(name)), this.args));
        }
        return this.diffCache.get(name);
    }
    for (let sign of signs) {
        ops.set(sign, Op);
    }

    return Op;
}

function genArray(len, rule) {
    return Array.from(new Array(len), rule)
}
function square(a) {
    return new Multiply(a, a);
}
function multi(op, ...args) {
    if (args.length === 1) {
        return args[0];
    }
    return args.reduce((a, b) => new op(a, b));
}
function power(a, pow) {
    if (pow === 0) {
        return Const.ONE;
    }
    return multi(Multiply, ...genArray(pow, () => a));
}

const Sign = makeOp(
    ["sign"],
    1,
    a => a >= 0 ? 1 : -1,
    () => null
);

const Add = makeOp(
    ["+"],
    2,
    (a, b) => a + b,
    (name, diffs, args) =>
        new Add(diffs[0], diffs[1])
);
const Subtract = makeOp(
    ["-"],
    2,
    (a, b) => a - b,
    (name, diffs, args) =>
        new Subtract(diffs[0], diffs[1])
);
const Multiply = makeOp(
    ["*"],
    2,
    (a, b) => a * b,
    (name, diffs, args) =>
        new Add(
            new Multiply(diffs[0], args[1]),
            new Multiply(diffs[1], args[0]))
);
const Divide = makeOp(
    ["/"],
    2,
    (a, b) => a / b,
    (name, diffs, args) =>
        new Divide(
            new Subtract(
                new Multiply(diffs[0], args[1]),
                new Multiply(diffs[1], args[0])),
            square(args[1]))
);
const Negate = makeOp(
    ["negate"],
    1,
    a => -a,
    (name, diffs, args) =>
        new Negate(diffs[0])
);
const Hypot = makeOp(
    ["hypot"],
    2,
    (a, b) => a * a + b * b,
    (name, diffs, args) =>
        new Multiply(
            Const.TWO,
            new Add(
                new Multiply(args[0], diffs[0]),
                new Multiply(args[1], diffs[1])))
);
const HMean = makeOp(
    ["hmean"],
    2,
    (a, b) => 2 / (1 / a + 1 / b),
    function (name, diffs, args) {
        return new Multiply(
            new Add(
                new Divide(diffs[0], square(args[0])),
                new Divide(diffs[1], square(args[1]))),
            new Divide(square(this), Const.TWO));
    }

);
const ArithMean = makeOp(
    ["arith-mean"],
    -1,
    (...args) => args.reduce((a, b) => a + b) / args.length,
    (name, diffs, args) => new ArithMean(...diffs)
);
const GeomMean = makeOp(
    ["geom-mean"],
    -1,
    (...args) => Math.pow(Math.abs(args.reduce((a, b) => a * b)), 1 / args.length),
    function (name, diffs, args) {
        let n = args.length;
        return new Divide(
            new ArithMean(...genArray(n, (_, i) => multi(Multiply, ...genArray(n, (_, j) => j === i ? diffs[j] : args[j])))), // (x1 * ... * xn)' / n
            new Multiply(new Sign(multi(Multiply, ...args)), power(this, n - 1))); // sign(x1 * ... * xn) * geom-mean ^ (n - 1)
    }
);
const HarmMean = makeOp(
    ["harm-mean"],
    -1,
    (...args) => args.length / args.map(a => 1 / a).reduce((a, b) => a + b),
    function (name, diffs, args) {
        return new Multiply(
            multi(Add, ...diffs.map((_, i) => new Divide(diffs[i], square(args[i])))), // x1' / x1^2 + ... + xn' / xn^2
            new Divide(square(this), new Const(args.length))) // n / ((1/x1 + ... + 1/xn) * (1/x1 + ... + 1/xn)) = harm-mean(x1...xn)^2 / n
    }
);

function makeCV(evaluate, diff) {
    function F(val) {
        this.val = val;
    }
    F.prototype.evaluate = evaluate;
    F.prototype.diff = diff;
    F.prototype.toString = function () { return this.val.toString() };
    F.prototype.prefix = F.prototype.toString;
    F.prototype.postfix = F.prototype.toString;
    return F;
}

const Const = makeCV(
    function () {
        return this.val;
    },
    () => Const.ZERO
);

Const.ZERO = new Const(0)
Const.ONE = new Const(1);
Const.TWO = new Const(2);

const Variable = makeCV(
    function (...vars) {
        return vars[varNames.get(this.val)];
    },
    function (name) {
        return name === this.val ? Const.ONE : Const.ZERO;
    }
);

const varNames = new Map([["x", 0], ["y", 1], ["z", 2]]);

function parse(expr) {
    let stack = [];
    let tokens = expr.trim().split(/\s+/);
    function parseToken(token) {
        if (!isNaN(token)) {
            return new Const(parseFloat(token));
        } else if (varNames.has(token)) {
            return new Variable(token);
        } else if (ops.has(token)) {
            let op = ops.get(token);
            let arity = op.prototype.arity;
            return new op(...stack.splice(-arity, arity));
        }
    }

    for (let token of tokens) {
        stack.push(parseToken(token));
    }

    return stack.pop();
}

function ParserError(message, expr, positions, position) {
    this.message = `${message}\n"${expr}"\n${" ".repeat(positions[position] + 1)}^`;
}
ParserError.prototype = Object.create(Error.prototype);
ParserError.prototype.name = "ParserError";
ParserError.prototype.constructor = ParserError;

function makeParser(mode) {
    return (expr) => {
        const END = -1;
        let tokens = [];
        let positions = [];

        function error(message, position = tokenCount) {
            return new ParserError(message, expr, positions, position);
        }

        function tokenize(expr) {
            let pos = 0;
            while (pos < expr.length) {
                while (/\s/.test(expr[pos])) {
                    pos++;
                }

                if (expr[pos] === "(" || expr[pos] === ")") {
                    tokens.push(expr[pos]);
                    positions.push(pos);
                    pos++;
                }

                let pos_ = pos;
                while (pos < expr.length && !(/\s/.test(expr[pos])) && expr[pos] !== "(" && expr[pos] !== ")") {
                    pos++;
                }

                let token = expr.slice(pos_, pos);
                if (token !== "") {
                    tokens.push(expr.slice(pos_, pos));
                    positions.push(pos_);
                }
            }
        }

        tokenize(expr);
        let tokenCount = -1;
        if (tokens.length === 0) {
            throw error("Empty input");
        }

        function nextToken() {
            if (tokenCount >= tokens.length - 1) {
                throw error("Tokens are over before correct end of expression, probably missing ')'");
            }
            return tokens[++tokenCount];
        }

        function parseBrackets() {
            let content = [];
            while (true) {
                let parsed = parseToken(nextToken());
                if (parsed === END) {
                    return content;
                }
                content.push(parsed);
            }
        }

        function parseToken(token) {
            if (token === "(") {
                let pos = tokenCount;
                let args = parseBrackets();
                let len = args.length;
                if (len === 0) {
                    throw error("Empty brackets", pos);
                }

                let op = mode === 0 ? args.shift() : args.pop();

                if (op.prototype === undefined || !op.prototype.isOperation) {
                    throw error(`${["First", "Last"][mode]} token in brackets must be an operation, got '${op}' instead`, pos);
                } else if (op.prototype.arity !== -1 && args.length !== op.prototype.arity) {
                    throw error(`Number of arguments (${args.length}) doesn't match arity (${op.prototype.arity})`, pos);
                }

                return new op(...args);
            } else if (varNames.has(token)) {
                return new Variable(token);
            } else if (!isNaN(token)) {
                return new Const(parseFloat(token));
            } else if (ops.has(token)) {
                // if (mode === 0 && tokenCount - 1 >= 0 && tokens[tokenCount - 1] !== "(" || mode === 1 && tokens[tokenCount + 1] !== ")") {
                //     throw error(`Incorrect syntax for operation ${token}, should be ${[`(${token} ...args)`, `(...args ${token})`][mode]}`);
                // }
                if (mode === 0 && tokenCount - 1 >= 0 && tokens[tokenCount - 1] !== "(") {
                    throw error("Missing (");
                } else if (mode === 1 && tokens[tokenCount + 1] !== ")") {
                    throw error("Missing )");
                }
                return ops.get(token);
            } else if (token === ")") {
                return END;
            }

            throw error(`Unsupported token: '${token}'`);
        }

        let firstToken = nextToken();
        if (firstToken !== "(" && tokens[tokens.length - 1] === ")") {
            throw error("Missing (");
        }

        let res = parseToken(firstToken);
        if (tokenCount === tokens.length - 1) {
            return res;
        } else {
            throw error(`Redundant symbols after correct expression: '${tokens.slice(tokenCount + 1).join(" ")}'`, tokenCount + 1);
        }
    }
}

const parsePrefix = makeParser(0);
const parsePostfix = makeParser(1);

