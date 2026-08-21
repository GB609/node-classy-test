# node-classy-test
Tired of using `describe`, `it`, `suite` or `test` in node tests? Just use a class as in Java, Python or similar.

# In a nutshell
1. Specify a suite of tests by declaring a class holding methods
2. Every method gets executed once as a test, with a new fresh instance of the class as `this`.
3. Save on typing and boilerplate verbosity

I made this because i generally like the embedded test framework in Node, but i don't like the sheer verbosity of it, 
nor am i a fan the "i'm writing a book rather than test code" approach.

It's an extract from a set of test convenience tools i wrote for another project and there's a bit more to come.

The code works on its own. No dependencies needed, no npm modules. Just curl the file 'src/js/node-classy-test.mjs' 
and use it with `--import` to configure the test environment.

# Getting started

```js
// file: useful.test.js

class AmIUseful {
  really() { assert.equal(true, false) }
  ["i dont think so"]() { assert.equal(42, 42) }
  moreContext(context) {
    // should rarely be needed - use another class
    context.test("check true", ()=>assert.ok(true));
  }

  // advanced feature
  static runSubClass = async (context)=>{
    await runTestClass(class Sub { isTest() { assert.ok(false) } }, context);
  }
}

runTestClass(AmIUseful)
```

```sh
node --import ./node-classy-test.mjs --test ./useful.test.js

# yields
▶ AmIUseful
  ✖ really (1.526364ms)
  ✔ i dont think so (0.338485ms)
  ▶ moreContext
    ✔ check true (0.595698ms)
  ✔ moreContext (1.167881ms)
  ▶ runSubClass
    ▶ Sub
      ✖ isTest (2.960804ms)
    ✖ Sub (4.027034ms)
  ✖ runSubClass (4.433166ms)
✖ AmIUseful (9.796427ms)
ℹ tests 8
ℹ suites 0
ℹ pass 3
ℹ fail 5
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 66.566341

# some more error logs ...
```

# Current API

1. `node:assert/strict` is added to global context for convenience.
2. `runTestClass` and `runTestClasses` are currently required to kick of the actual tests.  
   These functions look into the classes and wrap the methods defined on them into calls to `test` from node accordingly.
3. Don't import and use the real `test` from node, use the one provided by the module on the global context, avoid it alltogether is possible.  
   The basic idea behind this module was to NOT have to deal with that at all.  
   Reason: `test` needs a bit of patching to get the test class instance in and have to propagate down into subtests correctly.  
4. `suite`, `describe` and `it` shouldn't be used at all as they are not really compatible with the patched context.  
   But if you were planning on doing so, you wouldn't think about using `node-classy-test`, would you? 

# Caveats

- Similar to running 'regular' subtests, the number of executed, passed and failed tests include every level/layer.  
  It makes kind of sense, in a way, as any intermediate level could _also_ run asserts instead of just going into subtests.

- The framework uses `await` internally.  
  Due to the way how classes are parsed and evaluated, there is no real way to make them run async.
  The main reason for this is the capability to recurse and declare more subtests the same way.  
  To make this work with async, the code would have to differentiate methods which create the 'structural test tree' from
  the actual final nodes running tests. Intermediate layers must run sync. I just didn't bother as it is too much work.
  for too little benefit. This is actually a restriction/problem with the underlying test framework from node itself.

- The package json only serves the purpose to get code docs and completion for node. I don't plan on publishing to NPM.


# Open tasks

- [ ] Migrate `parameterized`.  
  (For the curious: [classy parameterized js test in use](https://github.com/GB609/batocera-ES-onArch/blob/40e078b8bc5b27c563add5d786cbd6ac6a028646/test/js/libs/path-utils.test.js#L52) )
- [ ] add tests
- [ ] document examples and behaviour for `constructor`, `before{all,each}` and `after{all,each}`
- [ ] document configuration and logging
