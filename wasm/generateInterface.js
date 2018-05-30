const fs = require('fs')
const path = require('path')

const interfaceManifest = {
  LOG: {
    name: 'log',
    input: ['readOffset', 'length', 'i32', 'ipointer', 'ipointer', 'ipointer', 'ipointer'],
    output: []
  },
  CALLDATALOAD: {
    name: 'callDataCopy256',
    input: ['pointer'],
    output: ['i256'] // TODO: this is wrong
  },
  GAS: {
    name: 'getGasLeft',
    input: [],
    output: ['i64']
  },
  ADDRESS: {
    name: 'getAddress',
    input: [],
    output: ['address']
  },
  BALANCE: {
    name: 'getBalance',
    async: true,
    input: ['address'],
    output: ['i128']
  },
  ORIGIN: {
    name: 'getTxOrigin',
    input: [],
    output: ['address']
  },
  CALLER: {
    name: 'getCaller',
    input: [],
    output: ['address']
  },
  CALLVALUE: {
    name: 'getCallValue',
    input: [],
    output: ['i128']
  },
  CALLDATASIZE: {
    name: 'getCallDataSize',
    input: [],
    output: ['i32']
  },
  CALLDATACOPY: {
    name: 'callDataCopy',
    input: ['writeOffset', 'i32', 'length'],
    output: []
  },
  CODESIZE: {
    name: 'getCodeSize',
    async: true,
    input: [],
    output: ['i32']
  },
  CODECOPY: {
    name: 'codeCopy',
    async: true,
    input: ['writeOffset', 'i32', 'length'],
    output: []
  },
  EXTCODESIZE: {
    name: 'getExternalCodeSize',
    async: true,
    input: ['address'],
    output: ['i32']
  },
  EXTCODECOPY: {
    name: 'externalCodeCopy',
    async: true,
    input: ['address', 'writeOffset', 'i32', 'length'],
    output: []
  },
  GASPRICE: {
    name: 'getTxGasPrice',
    input: ['opointer'],
    output: []
  },
  BLOCKHASH: {
    name: 'getBlockHash',
    async: true,
    input: ['i32'],
    output: ['i256']
  },
  COINBASE: {
    name: 'getBlockCoinbase',
    input: [],
    output: ['address']
  },
  TIMESTAMP: {
    name: 'getBlockTimestamp',
    input: [],
    output: ['i64']
  },
  NUMBER: {
    name: 'getBlockNumber',
    input: [],
    output: ['i64']
  },
  DIFFICULTY: {
    name: 'getBlockDifficulty',
    input: ['opointer'],
    output: []
  },
  GASLIMIT: {
    name: 'getBlockGasLimit',
    input: [],
    output: ['i64']
  },
  CREATE: {
    name: 'create',
    async: true,
    input: ['i128', 'readOffset', 'length'],
    output: ['address']
  },
  CALL: {
    name: 'call',
    async: true,
    input: ['i64', 'address', 'i128', 'readOffset', 'length'],
    output: ['i32']
  },
  CALLCODE: {
    name: 'callCode',
    async: true,
    input: ['i64', 'address', 'i128', 'readOffset', 'length'],
    output: ['i32']
  },
  DELEGATECALL: {
    name: 'callDelegate',
    async: true,
    input: ['i32', 'address', 'i128', 'readOffset', 'length', 'writeOffset', 'length'],
    output: ['i32']
  },
  SSTORE: {
    name: 'storageStore',
    async: true,
    input: ['ipointer', 'ipointer'],
    output: []
  },
  SLOAD: {
    name: 'storageLoad',
    async: true,
    input: ['ipointer'],
    output: ['i256'] // TODO: this is wrong
  },
  SELFDESTRUCT: {
    name: 'selfDestruct',
    input: ['address'],
    output: []
  },
  RETURN: {
    name: 'return',
    input: ['readOffset', 'length'],
    output: []
  }
}

function generateManifest (interfaceManifest, opts) {
  const useAsyncAPI = opts.useAsyncAPI
  const json = {}
  for (let opcode in interfaceManifest) {
    const op = interfaceManifest[opcode]
      // generate the import params
    let inputs = op.input.map(input => input === 'i64' ? 'i64' : 'i32').concat(op.output.filter(type => type !== 'i32' && type !== 'i64').map(() => 'i32'))
    let params = ''

    if (useAsyncAPI && op.async) {
      inputs.push('i32')
    }

    if (inputs.length) {
      params = `(param ${inputs.join(' ')})`
    }

    let result = ''
    const firstResult = op.output[0]
    if (firstResult === 'i32' || firstResult === 'i64') {
      result = `(result ${firstResult})`
    }
    // generate import
    const imports = `(import "ethereum" "${op.name}" (func $${op.name} ${params} ${result}))`
    let wasm = ';; generated by ./wasm/generateInterface.js\n'
      // generate function
    wasm += `(func $${opcode} `
    if (useAsyncAPI && op.async) {
      wasm += '(param $callback i32)'
    }

    let locals = ''
    let body = ''

    let callStrip = ''

    // generate the call to the interface
    let spOffset = 0
    let numOfLocals = 0
    let lastOffset
    let call = `(call $${op.name}`
    op.input.forEach((input) => {
      // TODO: remove 'pointer' type, replace with 'ipointer' or 'opointer'
      if (input === 'i128' || input == 'address' || input == 'pointer') {
        if (spOffset) {
          call += `(i32.add (get_global $sp) (i32.const ${spOffset * 32}))`
        } else {
          call += '(get_global $sp)'
        }
      } else if (input === 'ipointer') {
        // input pointer
        // points to a wasm memory offset where input data will be read
        // the wasm memory offset is an existing item on the EVM stack
        if (spOffset) {
          call += `(i32.add (get_global $sp) (i32.const ${spOffset * 32}))`
        } else {
          call += '(get_global $sp)'
        }
      } else if (input === 'opointer') {
        // output pointer
        // points to a wasm memory offset where the result should be written
        // the wasm memory offset is a new item on the EVM stack
        spOffset++
        call += `(i32.add (get_global $sp) (i32.const ${spOffset * 32}))`
      } else if (input === 'i64' && opcode === 'CALL') {
        // i64 param for CALL is the gas
        // add 2300 gas subsidy
        // for now this only works if the gas is a 64-bit value
        // TODO: use 256-bit arithmetic
        /*
        call += `(call $check_overflow_i64
           (i64.add (i64.const 2300)
             (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32}))))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3}))))`
        */

        // 2300 gas subsidy is done in Hera
        call += `(call $check_overflow_i64
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3}))))`
      } else if (input === 'i32') {
        call += `(call $check_overflow
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3}))))`
      } else if (input === 'i64' && opcode !== 'CALL') {
        call += `(call $check_overflow_i64
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})))
           (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3}))))`
      } else if (input === 'writeOffset' || input === 'readOffset') {
        lastOffset = input
        locals += `(local $offset${numOfLocals} i32)`
        body += `(set_local $offset${numOfLocals} 
    (call $check_overflow
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})))))`
        call += `(get_local $offset${numOfLocals})`
      } else if (input === 'length' && (opcode === 'CALL' || opcode === 'CALLCODE')) {
        // CALLs in EVM have 7 arguments
        // but in ewasm CALLs only have 5 arguments
        // so delete the bottom two stack elements, after processing the 5th argument

        locals += `(local $length${numOfLocals} i32)`
        body += `(set_local $length${numOfLocals} 
    (call $check_overflow 
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})))))

    (call $memusegas (get_local $offset${numOfLocals}) (get_local $length${numOfLocals}))
    (set_local $offset${numOfLocals} (i32.add (get_global $memstart) (get_local $offset${numOfLocals})))`

        call += `(get_local $length${numOfLocals})`
        numOfLocals++

        // delete 6th stack element
        spOffset--
        callStrip = `
      ;; zero out mem
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 4})) (i64.const 0))
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})) (i64.const 0))
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})) (i64.const 0))
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 1})) (i64.const 0))`

        // delete 7th stack element
        spOffset--
        callStrip += `
      ;; zero out mem
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 4})) (i64.const 0))
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})) (i64.const 0))
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})) (i64.const 0))
      (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 1})) (i64.const 0))`

      } else if (input === 'length' && (opcode !== 'CALL' && opcode !== 'CALLCODE')) {
        locals += `(local $length${numOfLocals} i32)`
        body += `(set_local $length${numOfLocals} 
    (call $check_overflow 
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})))
      (i64.load (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})))))

    (call $memusegas (get_local $offset${numOfLocals}) (get_local $length${numOfLocals}))
    (set_local $offset${numOfLocals} (i32.add (get_global $memstart) (get_local $offset${numOfLocals})))`

        call += `(get_local $length${numOfLocals})`
        numOfLocals++
      }
      spOffset--
    })

    spOffset++

    // generate output handling
    const output = op.output.shift()
    if (output === 'i128') {
      call =
        `${call} (i32.add (get_global $sp) (i32.const ${spOffset * 32}))`

      if (useAsyncAPI && op.async) {
        call += '(get_local $callback)'
      }

      call += `)
    ;; zero out mem
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})) (i64.const 0))
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})) (i64.const 0))`
    } else if (output === 'address') {
      call =
        `${call} (i32.add (get_global $sp) (i32.const ${spOffset * 32}))`

      if (useAsyncAPI && op.async) {
        call += '(get_local $callback)'
      }

      call += `)
    ;; zero out mem
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})) (i64.const 0))
    (i32.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2 + 4})) (i32.const 0))`
    } else if (output === 'i256') {
      call = `${call} 
    (i32.add (get_global $sp) 
    (i32.const ${spOffset * 32}))`

      if (useAsyncAPI && op.async) {
        call += '(get_local $callback)'
      }

      call += `)
      (drop (call $bswap_m256 (i32.add (i32.const 32) (get_global $sp))))
      `
    } else if (output === 'i32') {
      if (useAsyncAPI && op.async) {
        call += '(get_local $callback)'
      }

      if (opcode === 'CALL' || opcode === 'CALLCODE' || opcode === 'DELEGATECALL') {
        call =
          `(i64.store
      (i32.add (get_global $sp) (i32.const ${spOffset * 32}))
      (i64.extend_u/i32
        (i32.eqz ${call}) ;; flip CALL result from EEI to EVM convention (0 -> 1, 1,2,.. -> 1)
      )))
      ${callStrip}
      `
      callStrip = ''
      } else {
        call =
          `(i64.store
      (i32.add (get_global $sp) (i32.const ${spOffset * 32}))
      (i64.extend_u/i32
        ${call})))`
      }

      call += `
    ;; zero out mem
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})) (i64.const 0))
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})) (i64.const 0))
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})) (i64.const 0))`
    } else if (output === 'i64') {
      if (useAsyncAPI && op.async) {
        call += '(get_local $callback)'
      }
      call =
        `(i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32})) ${call}))

    ;; zero out mem
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 3})) (i64.const 0))
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8 * 2})) (i64.const 0))
    (i64.store (i32.add (get_global $sp) (i32.const ${spOffset * 32 + 8})) (i64.const 0))`
    } else if (!output) {
      if (useAsyncAPI && op.async) {
        call += '(get_local $callback)'
      }
      call += ')'
    }

    wasm += `${locals} ${body} ${call})`
    json[opcode] = {
      wast: wasm,
      imports: imports
    }
  }

  // add math ops
  const files = fs.readdirSync(__dirname).filter(file => file.slice(-5) === '.wast')
  files.forEach((file) => {
    const wast = fs.readFileSync(path.join(__dirname, file)).toString()
    file = file.slice(0, -5)
    // don't overwrite import generation
    json[file] = json[file] || {}
    json[file].wast = wast
  })

  return json
}

// generateManifest mutates the input, so use a copy
const interfaceManifestCopy = JSON.parse(JSON.stringify(interfaceManifest))

let syncJson = generateManifest(interfaceManifest, {'useAsyncAPI': false})
let asyncInterfaceJson = generateManifest(interfaceManifestCopy, {'useAsyncAPI': true})

fs.writeFileSync(path.join(__dirname, 'wast.json'), JSON.stringify(syncJson, null, 2))
fs.writeFileSync(path.join(__dirname, 'wast-async.json'), JSON.stringify(asyncInterfaceJson, null, 2))
