"use strict"

let func = f => (...args) => (...vars) => f(...(args.map(a => a(...vars))))

let cnst = val => _ => val
let variable = name => (...args) => args[vars[name]]

let add = func((a, b) => a + b)
let subtract = func((a, b) => a - b)
let multiply = func((a, b) => a * b)
let divide = func((a, b) => a / b)
let negate = func(x => -x)
let madd = func((x1, x2, x3) => x1 * x2 + x3)
let floor = func(x => Math.floor(x))
let ceil = func(x => Math.ceil(x))

let one = cnst(1)
let two = cnst(2)


let ops = {
    "*+" : [madd, 3],
    "madd": [madd, 3],
    "+" : [add, 2],
    "-" : [subtract, 2],
    "*" : [multiply, 2],
    "/" : [divide, 2],
    "negate" : [negate, 1],
    "floor": [floor, 1],
    "_": [floor, 1],
    "ceil": [ceil, 1],
    "^": [ceil, 1]}

let vars = {"x": 0, "y": 1, "z": 2}

let consts = {"one": one, "two": two}

function parse(expr) {
    let stack = []
    let tokens = expr.trim().split(/\s+/)
    let orderedArgs = n => { let a = []; for (let i = 0; i < n; i++) a.push(stack.pop()); return a.reverse() }
    let parseToken = token => {
        if (!isNaN(parseFloat(token)))
            return cnst(parseFloat(token))
        if (token in vars)
            return variable(token)
        if (token in ops)
            return ops[token][0](...orderedArgs(ops[token][1]))
        if (token in consts)
            return consts[token]
    }

    for (let token of tokens)
        stack.push(parseToken(token))

    return stack.pop()
}
