;; generated by ./wasm/generateInterface.js
(import $getCallValue "ethereum" "getCallValue" (param i32) )
(func $CALLVALUE 
  (param $sp i32)  (call_import $getCallValue (i32.add (get_local $sp) (i32.const 32)))

  ;; zero out mem
  (i64.store (i32.add (get_local $sp) (i32.const 56)) (i64.const 0))
  (i64.store (i32.add (get_local $sp) (i32.const 48)) (i64.const 0)))