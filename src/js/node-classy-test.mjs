import { Module } from 'node:module'
import * as fs from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, relative, join } from 'path';

import { suite, test, before, after, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
export { assert, suite }

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
globalThis.__filename = __filename
globalThis.__dirname = __dirname

const ROOT_PATH = process.env.ROOT_PATH || process.cwd();

if (process.env.REQUIRE_PATH) {
  Module.registerHooks({
    resolve: (spec, context, next) => {
      let shortcut = join(process.env.REQUIRE_PATH, spec);
      if (fs.existsSync(shortcut)) { return next(shortcut); }
      return next(spec);
    }
  })
}

let LOGGER = {
  log: NOOP,
  info: NOOP,
  warn: NOOP,
  error: NOOP,
  debug: NOOP
}

const LIFECYCLE_HOOKS = {}
/**
 * This module provides a few points during execution, where users have the change to intercept and influence the 
 * configuration and interpretation of test classes.  
 * Some of the hooks might be similar to test hooks, e.g. a `beforeAll`, but the intention is different.  
 * The hooks are about configuring/managing the test's execution runtime itself, while `before...` are aimed at
 * managing the execution environment of a concrete test.
 */
const HOOK_NAMES = {
  /** 
   * Called when the test context for a class was created, shortly before defining/running test hooks and methods.  
   * Arguments passed to the callback: testClass, testContext
   */
  PRE_ENTER_CLASS: "PRE_ENTER_CLASS"
}
Object.freeze(HOOK_NAMES);

/** 
 * Main entry point to run a single class as a suite of tests.  
 * The basic idea:
 * - Each and every test function gets a fresh instance of testClass as 'this' which can be used for isolated,  
 *   yet also more complicated setups.
 * - No need for any boilerplate. Just define the tests without any wordy descriptions.
 * - The API for test functions is identical to what `TestContext.test()` passes to the test lambdas.
 * 
 * 1. The class itself is registered as top-level test
 * 2. Search for functions in the class definition (=properties of prototype and static members of class object)
 * 3. For each function found:  
 *     - Create a new instance of testClass for each function found and bind the instance to the test function
 *     - wrap and run the test function as test from the parent class context
 *
 * Some methods with pre-defined names are interpreted specially and will not be picked as tests:
 * - `constructor`: Self-explanatory. During test instance creation, the constructor is called with the test name as argument.
 * - `beforeAll`, `afterAll`: API corresponds to `TestContext.before` and `TestContext.after`,  
 *    but only runs for the class on which it was specified (this distinction is important when {@link runTestClasses} is used).  
 * - `beforeEach`, `afterEach`: API corresponds to the identically named functions in `TestContext`.  
 *    Contrary to the 'real' methods, these are set up to run with the concrete test instance set to this.
 *
 * @param {class} testClass - class holding test methods
 * @param {string=} testName - Allows to override the name that is passed to the top level invocation of `test`.  
 *        Defaults to `testClass.name.`
 * @param {TestContext} parentContext - not intended to be used in test files.  
 *        Exists for correct handling of {@link runTestClasses}
 */
export async function runTestClass(testClass, testName = testClass.name, parentContext = false) {
  LOGGER.log("running class", testClass);

  if (typeof testName != 'string') {
    if (testName && !parentContext) { parentContext = testName; }
    testName = testClass.name;
  }
  if (fs.existsSync(testName)) { testName = relative(ROOT_PATH, testName); }

  let testRunnerMethod = parentContext ? parentContext.test : GLOBAL_scheduleTestMethod;
  await testRunnerMethod(testName, async (context) => {
    optionalCallHook(HOOK_NAMES.PRE_ENTER_CLASS, null, testClass, context);
    context.before(executeIfExisting.bind(null, testClass, 'beforeAll'));
    context.after(executeIfExisting.bind(null, testClass, 'afterAll'));
    await runTestMethods(testClass, context);
  });
}

/**
 * This function allows to define and run several 'TestSuite' classes in one file.  
 * An arbitrary number of `class` objects can be passed in. Each class is evaluated and executed according to 
 * {@link runTestClass}, but ALL of them are grouped under one parent 'test'.  
 * 
 * Example:
 * ```
 * TestClassA {
 *   isLetter() { ... }
 * }
 * TestClassB {
 *   isUppercase() { ... }
 * }
 * 
 * runTestClasses("Alphabet Testing", TestClassA, TestClassB)
 * ```
 * 
 * This is useful when related test suites shall be grouped, but still need different setups/teardowns.  
 * Or whenever you prefer to split up one large class into smaller chunks.  
 * When no name is given, the function attempts to take the effective test file name, made relative to `(env.ROOT_PATH || cwd)`.
 */
export async function runTestClasses(name, ...classes) {
  if (typeof name != "string") {
    classes = [name, ...classes];
    name = new CallingModuleName().toString();
  }

  await GLOBAL_scheduleTestMethod(name, async (ctx) => {
    for (let cls of classes) { await runTestClass(cls, cls.name, ctx) }
  });
}

/* ----- Config API ----- */

/**
 * Allows to register callbacks for special hooks. Must be run before any call to {@link runTestClass} or {@link runTestClasses}.
 * @param {keyof HOOK_NAMES} hookName
 */
export function registerLifecycleHook(hookName, callback) {
  if (!HOOK_NAMES[hookName]) { throw `'${hookName}' is not a recognized hook type.`; }
  LIFECYCLE_HOOKS[hookName] = callback;
}

function optionalCallHook(hookName, thisArg = null, ...args) {
  let hook = LIFECYCLE_HOOKS[hookName] || NOOP;
  hook.call(thisArg, ...args);
}

/** 
 * Control additional log output done by the module. 
 * The module is generally using the function names as defined by `console`, but uses a default NOOP stubbed object.
 * This function allows to pass in other implementation, which might as well be 'globalThis.console' or something else.  
 *
 * As long as the passed in instance holds functions named `log`, info`, `warn`, `error` and `debug`, it can be used.
 */
export function setLogger(consoleLike) { LOGGER = consoleLike; }

/* ----- The heavy work functions ----- */

let hooksRegistered = [];
/**
 * This is the primary trick to get most functionality running: A "patched" `test` function which does a lot of extra
 * work to ensure the right object instances are used as `this` in tests.  
 * 
 * The hard part about this is that it also has to work the same way for subtests (=using to `context.test`),
 * but without being seen or having to be aware of in test code.  
 * To achieve this, the patched function is injected into globalThis and exported. It wraps itself around the real test
 * and, before delegating the call, makes sure to replace `test` in the real, incoming context again with a bound variant of itself.  
 * That way, the code can ensure that the patched `test` is propagated everywhere.
 */
async function scheduleTestMethod(realTestMethod, ...testArgs) {
  //test args: [name,] [options,] fn
  if (testArgs.length < 0 || testArgs.length > 3) { throw "Too few or too many arguments!" }
  let testFn = testArgs.splice(-1)[0];

  let options, name;
  if (typeof testArgs.at(-1) == "object") { options = testArgs.splice(-1)[0] }
  else { options = {} }

  if (typeof testArgs.at(-1) == "string") { name = testArgs.splice(-1)[0] }
  else { name = testFn.name }

  const isTopLevel = realTestMethod == test;

  async function delegate(context) {
    let localContext = Object.create(defineContext(context));
    localContext.testInstance ||= {}

    let realTest = context.test;
    // When nesting tests in each other:
    // node seems to run all parent-level beforeEach/afterEach hooks for all subtests recursively
    // but this is not desirable when a test class defines a nested parameterized test
    if (isTopLevel && !hooksRegistered.includes(context)) {
      hooksRegistered.push(context);
      context.beforeEach((ctx) => {
        let instance = (ctx._instances || {})[ctx.name];
        if (typeof instance == "object") { executeIfExisting.call(null, instance, "beforeEach", ctx) }
      })
      context.afterEach((ctx) => {
        let instance = (ctx._instances || {})[ctx.name];
        if (typeof instance == "object") { executeIfExisting.call(null, instance, "afterEach", ctx) }
      })
    }

    context.test = scheduleTestMethod.bind(context, realTest.bind(context));
    await runTest.call(null, localContext.testInstance, testFn, name, context);
  }
  Object.defineProperty(delegate, "name", { value: name });
  return realTestMethod(name, options, delegate);
}
const GLOBAL_scheduleTestMethod = scheduleTestMethod.bind(null, test);
export { GLOBAL_scheduleTestMethod as test }

async function runTest(testInstance, testMethod, name, testContext = null) {
  Object.defineProperty(testMethod, 'name', { value: name });
  let error;
  LOGGER.info("BEGIN:", name);
  try {
    await testMethod.call(testInstance, testContext);
  }
  catch (e) { error = e; }
  finally { LOGGER.info("END:", name) }
  if (error) {
    LOGGER.error(" ^*** FAILED:\n", error.message || error);
    throw error;
  }
  else LOGGER.info(" ^*** SUCCESS");
}

async function runTestsFromObject(methodHolder, instanceFactory, contextIn = null) {
  let context = defineContext(contextIn);
  Object.getPrototypeOf(context)._instances ||= {};
  let instances = Object.getPrototypeOf(context)._instances;
  for (let [name, runner] of Object.entries(methodHolder)) {

    let testInstance = new instanceFactory(name);
    // parameterized tests do get a instance, but will not be registered
    // in `instances` to prevent pre/post test hook.
    // These will run - but for each subtest
    if (!runner.origin) { instances[name] = testInstance }
    Object.defineProperty(runner, 'name', { value: name });

    let realTest = runner.bind(testInstance);
    realTest[Symbol.for("TESTINSTANCE")] = testInstance;
    await context.test(name, realTest);
  }
}

async function runTestMethods(testClass, context) {
  let tests = Object.assign({}, Object.getOwnPropertyDescriptors(testClass.prototype));
  Object.assign(tests, Object.getOwnPropertyDescriptors(testClass));

  let filter = ['constructor', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach'];
  let validTests = {};
  for (let [name, desc] of [...Object.entries(tests)]) {
    let value = desc.value;
    if (filter.includes(name)) { continue }
    if (typeof value != "function") { continue }

    validTests[name] = value;
    Object.defineProperty(value, "name", { value: name })
  }
  return await runTestsFromObject(validTests, testClass, context, testClass.name);
}

/* ----- INTERNAL HELPERS ----- */

/** Do nothing. Only used to stub out optional methods and hooks where needed. */
function NOOP() {}

/** This is a fallback that should never really be needed. It's a simple safety measure. */
function defineContext(context = null) {
  if (context == null) {
    LOGGER.error("declare new pseudo-context")
    return {
      test: test,
      before: before,
      after: after,
      beforeEach: beforeEach,
      afterEach: afterEach
    }
  }

  return context
}

/** 
 * Get the named function from receiver and call it with `this` set accordingly.
 * Does nothing if the function doesn't exist in the receiver. 
 */
function executeIfExisting(receiver, functionName, ...params) {
  LOGGER.debug("try to run", functionName, "against", receiver);
  (receiver[functionName] || NOOP).call(receiver, ...params);
}

/** 
 * Used to find out from where a method defined in this file was called.  
 * It is a class instead of just a function because it has to go a roundabout way through `Error#captureStackTrace`.
 */
class CallingModuleName {
  static nonameCounter = 0;
  constructor() { Error.captureStackTrace(this); }

  valueOf() { return this.toString(); }
  toString() {
    let callingFileName = this.getCallingModuleName();
    return relative(ROOT_PATH, callingFileName)
  }

  getCallingModuleName() {
    let lines = this.stack.split('\n');
    for (let l of lines) {
      if (/Error|.*\/node-classy-test.mjs\:.*/.test(l)) { continue }
      let match = /at .* \((.*js)\:\d+\:\d+\)/.exec(l);
      if (match) { return match[1]; }
    }
    return __filename + `_${CallingModuleName.nonameCounter++}`;
  }
}

Object.assign(globalThis, {
  //require: require,
  suite: suite, test: GLOBAL_scheduleTestMethod,
  assert: assert,
  runTestClass, runTestClasses,
  registerLifecycleHook, HOOK_NAMES,
  //path: (p)=>{ console.error(p + " resolves to:", require.resolve.paths(p))}
})