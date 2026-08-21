const testee = require('lib/productive-code.js')

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

test("mult", ()=>{ assert.equal(4, testee.timesTwo(2)) })