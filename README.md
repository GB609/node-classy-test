# node-classy-test
Tired of using `describe`, `it`, `suite` or `test` in node tests? Just use a class as in Java, Python or similar.

# In a nutshell
Define a class with simple methods like `testMethod(){ doSomething }` and run it through the framework.  
Class methods are internally executed with the regular, more verbose `test('testMethod', ()=>runnable)` pattern, all while also handling subtest capabilities.  
In terms of scope, it imitates some of the behaviour of Junit or PyUnit test classes.

**A few more details:**

1. One file with minimal tooling (`node-classy-test.mjs`) takes care of semantical and syntactical boilerplate in node tests.
   Use as global import from the command line and forget about undesirable syntax constructs in all tests run with it.
2. Specify a suite of tests by declaring a class holding methods
3. Every method gets executed once as a test, each with a new fresh instance of the class as `this`  
    = It becomes harder to pollute the context of one test method with dangling data from another one.
4. Save on typing and boilerplate verbosity.
5. Simple test cases won't need any superfluous lamba declarations.
6. It's more than just syntactical sugar. The fact that it is based on classes and ensures valid `this` references
   for all test methods opens up powerful possibilites to leverage common code for shared setups.  
   Including all the possibilities the JS class construct allows, like true private members.

It's an extract from a set of test convenience tools i wrote for another project and there's a bit more to come.

The code works on its own. No dependencies needed, no npm modules. Just curl the file `src/js/node-classy-test.mjs` 
and use it with `--import ./node-classy-test.mjs --test ...` to configure the test environment.

# Getting started

Of course, there are more advanced constructs and support for pre-/post test hooks. But the basic pattern is just:

```js
// file: useful.test.js

class AmIUseful {
  really() { assert.equal(true, false) }

  // for those that _really_ think to need prose descriptions
  ["i dont think so"]() { assert.equal(42, 42) }

  manualSubtests(context) {
    // The 'normal' API/Syntax is still supported and working.
    // BUT: tests added like this will NOT get any 'before' or 'after' hooks defined on the parent class 
    context.test("check true", ()=>assert.ok(true));
  }

  // Theoretically possible advanced feature.
  async runSubClass(context) {
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
  ▶ manualSubtests
    ✔ check true (0.595698ms)
  ✔ manualSubtests (1.167881ms)
  ▶ runSubClass
    ▶ Sub
      ✖ isTest (2.960804ms)
    ✖ Sub (4.027034ms)
  ✖ runSubClass (4.433166ms)
✖ AmIUseful (9.796427ms)
# statistics ...

# some more error logs ...
```

I'll leave it up to the interested reader to write a test file with the regular syntax that produces the same output...

# Current API

## Basics

1. `globalThis.assert`: `node:assert/strict` is added to global context for convenience.
2. `runTestClass` and `runTestClasses` are currently required to kick of the actual tests.  
   These functions look into the classes and wrap the methods defined on them into calls to `test` from node accordingly.
3. Don't import and use the real `test` from node, use the one provided by the module on the global context, avoid it alltogether if possible.  
   The basic idea behind this module was to NOT have to deal with that at all.  
   **Reason**: `test` needs a bit of patching to get the test class instance in and to get it to propagate down into subtests correctly.  
4. `suite`, `describe` and `it` shouldn't be used at all as they are not really compatible with the patched context.  
   But if you were planning on doing so, you wouldn't think about using `node-classy-test`, would you?
   I didn't bother with them as the intention was to do away with them in the first place.

## Test hooks / special methods

```js
class TestClass {
  // Invoked during instance creation. Concrete test name will be passed.
  constructor(name) 

  // Test hooks running once per class, before or after ALL test methods. Gets class object as 'this'.
  beforeAll(testContext)
  afterAll(testContext)

  // Running once per actual test method/instance. Will have class instance as 'this'.
  beforeEach(testContext)
  afterEach(testContext)
}
```

# Caveats / Gotchas and Notes

- Similar to running 'regular' subtests, the number of executed, passed and failed tests include every level/layer.  
  It makes kind of sense, in a way, as any intermediate level could _also_ run asserts instead of just going into subtests.

- The framework uses `await` internally.  
  Due to the way how classes are parsed and evaluated, there is no real way to make them run async.
  The main reason for this is the capability to recurse and declare more subtests the same way.  
  To make this work with async, the code would have to differentiate methods which create the 'structural test tree' from
  the actual final nodes running tests. Intermediate layers must run sync. I just didn't bother as it is too much work.
  for too little benefit. This is actually a restriction/problem with the underlying test framework from node itself.

- The `package.json` only serves the purpose of getting code docs and completion for node into eclipse. I don't plan on publishing to NPM.

- It's currently not possibly to restart just a single test from a class.

- `test.skip` and other similar features of node test framework don't work (yet). Didn't see a need for them up to now.

# Why
I generally like the embedded test framework in Node because it means that i don't have to deal with managing dependencies to some third-party libraries.
However, i frankly find part of the established API and syntax used in the framework incredibly clunky and far too verbose for writing a couple of quick, small tests.
Jasmine isn't much better in that regard - it's the 'modern' approach itself i take issue with. It's a good example of `(new || trending) != better`, where 'renewal' has become a self-fulfilling prophecy just for it's own sake instead of really making anything better.

In other words, i find the terms `describe` and `it` illogical and unsuitable for unit tests and the `test('some long description', ()=>{...})` syntax too cluttery. 
It's not concise and requires too many syntax constructs which are simply distracting from the actual content.  
If a test needs half a sentence to explain what's going on, it's too complicated and should instead make use of **proper** JSDoc instead **or** be split up into smaller units.

So i set out to implement a wrapper that deals with that bothersome syntax for me. 

# Advanced features

## Run parameterized tests
Define a list of several data sets to run against the same function. Each data set will be an individual sub test, so one failure will not stop/cancel other iterations from the set. Thus, test reports will accurately reflect and contain the specific sets which actually failed.

The syntax is more verbose than the simple case, but it allows to quickly add variation tests without having to deal with most of the plumbing behind it.

The basic syntax is

```js
testRunnable = parameterized(
  [],                       // Constellations to test. Once entry is passed per test run.
  function(use-case args),  // Function to run the actual test. Runs once per constellation as subtest
  ?nameBuilder              // Optional. Used to customize subtest names
)
```

More details:
- **constellations**: Top level must be array. Entries can be arbitrary, but must match to what the test function expects.  
  Special exception: when the entry is an array itself, it will be destructured before passing to the test function.  
  **Note:** It is NOT required that this array is a constant. It could also be produced by a function or inline code.
- **test function**: This contains the test logic. Important: It MUST be a function, if the test function shall be able to
  reference `this` (and thus make use of test hooks). Lambdas can't be rebound and don't support `this`.
- **nameBuilder**: Each subtest must be uniquely named and distinguishable.  
  Parameterized tries to apply a sensible default which constructs a name from the test function name and a stringification
  of the constellation, which is why this argument is optional.  
  But the default can lead to very long and illegible names for 2-dimensional arrays with many parameters.  
  For this reason, nameBuilder can be specified, either in one of 3 different 'declarative' ways or ultimately by supplying
  a function.

What actually happens here:  
1. `parameterized` generates a dictionary of test specifications
2. These specifications are bound locally to a dynamically created 'test function' which matches the node test api.
3. When this test is picked up, it uses the actual `TestContext` it receives during runtime to run the predefined subtests.
4. The return of `parameterized` can directly be used with `test('something', parameterizedReturn)`.  
   But in this case, `this` will just be a new regular object per constellation.
5. The function returned by `parameterized` can also be assigned to a static member of a test class, so it will be picked
   when `runTestClass` scans the class's prototype. In this case, the effective tests all will have an instance of the
   parent class as `this` and all test hooks run as they were defined on the class.

Example:

```js
class ParameterizedTests {
  static isNaN = parameterized(
    [1, 2, 3, Number.NaN, 5, 9],
    function(value) { assert.ok(Number.isNaN(value)); }
    //'${0}' // 3 parameter is optional, but can be used to control the generated test names
  )

  static multipleParameter = parameterized(
    [
      [4, 5],
      [9, 7]
    ],
    function firstIsLarger(a, b) { assert.ok(a > b); }
  )
}

runTestClass(ParameterizedTests);
```

Result:

```sh
▶ ParameterizedTests
  ▶ isNaN
    ✖ [0] - 1 (4.808864ms)
    ✖ [1] - 2 (0.519034ms)
    ✖ [2] - 3 (0.510348ms)
    ✔ [3] - NaN (0.239259ms)
    ✖ [4] - 5 (0.409168ms)
    ✖ [5] - 9 (0.336933ms)
  ✖ isNaN (8.541349ms)
  ▶ multipleParameter
    ✖ firstIsLarger[0] - [4,5] (0.455054ms)
    ✔ firstIsLarger[1] - [9,7] (0.148298ms)
  ✖ multipleParameter (1.104192ms)
✖ ParameterizedTests (11.271792ms)
```

# Open tasks

- [x] Migrate `parameterized`.  
  (For the curious: [classy parameterized js test in use](https://github.com/GB609/batocera-ES-onArch/blob/40e078b8bc5b27c563add5d786cbd6ac6a028646/test/js/libs/path-utils.test.js#L52) )
- [ ] add tests
- [ ] document examples and behaviour for `constructor`, `before{all,each}` and `after{all,each}`
- [ ] document configuration and logging
- [ ] find an alternative way to detect classes in a file and run them automatically via implicit `runTestClass` or `runTestClasses`
