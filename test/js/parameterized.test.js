// SPDX-FileCopyrightText: 2026 Karsten Teichmann
//
// SPDX-License-Identifier: MIT

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