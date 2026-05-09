export default [
  {
    files: ["plugins/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        indexedDB: "readonly",
        IDBKeyRange: "readonly",
        navigator: "readonly",
        MutationObserver: "readonly",
        getComputedStyle: "readonly",
        NodeFilter: "readonly",
        history: "readonly",
        Node: "readonly",
        IntersectionObserver: "readonly",
        
        // BetterDiscord globals
        BdApi: "readonly",
        
        // Node globals (for plugin system)
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      }
    },
    rules: {
      // Error detection
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-func-assign": "error",
      "no-irregular-whitespace": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-constant-condition": "warn",
      "no-empty": "warn",
      "no-extra-semi": "warn",
      "no-unused-vars": ["warn", { 
        "args": "none", 
        "varsIgnorePattern": "^_",
        "caughtErrors": "none"
      }],
      "no-sparse-arrays": "warn",
      "no-fallthrough": "warn",
      "no-async-promise-executor": "error",
      "no-compare-neg-zero": "error",
      "no-cond-assign": "error",
      "no-debugger": "warn",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-empty-character-class": "error",
      "no-ex-assign": "error",
      "no-extra-boolean-cast": "warn",
      "no-inner-declarations": "warn",
      "no-invalid-regexp": "error",
      "no-loss-of-precision": "error",
      "no-misleading-character-class": "error",
      "no-obj-calls": "error",
      "no-promise-executor-return": "warn",
      "no-prototype-builtins": "warn",
      "no-regex-spaces": "warn",
      "no-setter-return": "error",
      "no-template-curly-in-string": "warn",
      "no-unexpected-multiline": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-unsafe-optional-chaining": "error",
      "require-atomic-updates": "warn",
    }
  }
];

