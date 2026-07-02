# [1.7.0](https://github.com/OmerMohideen/react-crap/compare/v1.6.0...v1.7.0) (2026-07-02)


### Bug Fixes

* **audit:** cap --audit-deps table width, shorten advisory to GHSA id ([8b23dea](https://github.com/OmerMohideen/react-crap/commit/8b23dea7c311df56c3ac69aa995e4a9d9f0549c8))
* **cache:** tie cache version to package version ([ea61de1](https://github.com/OmerMohideen/react-crap/commit/ea61de129b03f5407f52e28a9208143a786712ff))
* **duplicates:** skip anonymous inline callbacks (handler/callback noise) ([babb425](https://github.com/OmerMohideen/react-crap/commit/babb425463b5c8e559d557c82e884968bc841a54))
* **smells:** three false positives found testing DIM ([c2361ec](https://github.com/OmerMohideen/react-crap/commit/c2361ec42a02dec2a264206e311eeb37eed1bae8))


### Features

* --arch — circular imports and barrel-bloat detection ([2b21722](https://github.com/OmerMohideen/react-crap/commit/2b21722de526761dbe296afaa5327642b77c3004))
* --audit-supply-chain — install-script + typosquat heuristics ([35288ca](https://github.com/OmerMohideen/react-crap/commit/35288cab5094eeb5c4d0e0efba52858fe9078024))
* --score / --min-score gate; confirm --checks --watch ([fe69c56](https://github.com/OmerMohideen/react-crap/commit/fe69c56a9cbcbb6884baebbca27e0b7cba617c53))
* 3 more a11y rules + per-rule severity override ([cecf0bb](https://github.com/OmerMohideen/react-crap/commit/cecf0bb8474cdd8a3cf65446f5561ce741f05b7d))
* accessibility/security smell rules + per-rule config ([5e6b6fd](https://github.com/OmerMohideen/react-crap/commit/5e6b6fdb5e2af92754b3bbbf51ba3cb440397e0e))
* line-level diff scoping, --fail-on-findings gate, zero-config audit ([353ca87](https://github.com/OmerMohideen/react-crap/commit/353ca875b3a2597441d1ad971df6e2a1c084fb7d))
* perf/security/best-practice smells + npm dependency audit ([50da6b4](https://github.com/OmerMohideen/react-crap/commit/50da6b4bfd72bf45bfb83d6d606281a63ae62df8))
* pnpm and yarn support for --audit-deps ([edec071](https://github.com/OmerMohideen/react-crap/commit/edec071e7c1aee7b0c73fbf62a83aff27110223f))
* polished report headers and health-score footer ([99f471f](https://github.com/OmerMohideen/react-crap/commit/99f471fe3675171392d66876ac8cd049ea018cb2))
* versioned JSON schemas + e2e tests for coverage-free checks ([f22a1c2](https://github.com/OmerMohideen/react-crap/commit/f22a1c26232c38f2e762044d549c96ab3b01360c))

# [1.6.0](https://github.com/OmerMohideen/react-crap/compare/v1.5.0...v1.6.0) (2026-06-24)


### Bug Fixes

* reject unknown --duplicates mode with a helpful error ([71f1ebb](https://github.com/OmerMohideen/react-crap/commit/71f1ebb2b0e3de34164c5f7a542f1de3311e107f))


### Features

* add AI-slop smell detection (--smells) ([08254a8](https://github.com/OmerMohideen/react-crap/commit/08254a8758c1159f8d7e8242711eb1d32dd2346a))
* add dead-code, near-duplicate, passthrough & test-assert detection ([2cf6907](https://github.com/OmerMohideen/react-crap/commit/2cf6907143ac87354177259d6b50cca3fff550ab))
* add duplicate function detection ([7c354f7](https://github.com/OmerMohideen/react-crap/commit/7c354f71900f4171807af5fddc082672ae2efba3))
* add portable json/github output for checks and CI examples ([3768b05](https://github.com/OmerMohideen/react-crap/commit/3768b05f9a16702aef34f389235506bb68ffa9f1))
* colorize duplicates/smells/dead-code output ([8f9cb70](https://github.com/OmerMohideen/react-crap/commit/8f9cb7078158f6b54b36039652684ac159062a0b))

# [1.5.0](https://github.com/OmerMohideen/react-crap/compare/v1.4.0...v1.5.0) (2026-06-13)


### Features

* add react-aware metadata and enhance reporting features ([#5](https://github.com/OmerMohideen/react-crap/issues/5)) ([ee40385](https://github.com/OmerMohideen/react-crap/commit/ee40385b0afaa466c7c5c45419f188cadceedf87))

# [1.4.0](https://github.com/OmerMohideen/react-crap/compare/v1.3.1...v1.4.0) (2026-06-02)


### Features

* add --sort option for flexible output ordering ([#4](https://github.com/OmerMohideen/react-crap/issues/4)) ([79c4bca](https://github.com/OmerMohideen/react-crap/commit/79c4bcad7edbe768304bac5a7c30eeaa7dd27ae1))

## [1.3.1](https://github.com/OmerMohideen/react-crap/compare/v1.3.0...v1.3.1) (2026-05-31)


### Bug Fixes

* function-level changed filtering and update documentation ([#3](https://github.com/OmerMohideen/react-crap/issues/3)) ([dd1df41](https://github.com/OmerMohideen/react-crap/commit/dd1df416f61d52442973f5fd657359226bcf8dfa))

# [1.3.0](https://github.com/OmerMohideen/react-crap/compare/v1.2.0...v1.3.0) (2026-05-31)


### Features

* add --changed flag for analyzing uncommitted files and improve tests ([#2](https://github.com/OmerMohideen/react-crap/issues/2)) ([6f85566](https://github.com/OmerMohideen/react-crap/commit/6f855662740fe72b4bebff9589d1ff19a8adbf2a))

# [1.2.0](https://github.com/OmerMohideen/react-crap/compare/v1.1.0...v1.2.0) (2026-05-30)


### Features

* implement version checking and update notifications ([#1](https://github.com/OmerMohideen/react-crap/issues/1)) ([4cee127](https://github.com/OmerMohideen/react-crap/commit/4cee127a6d192d98f80c2ab6b4c856b17a0c314a))

# [1.1.0](https://github.com/OmerMohideen/react-crap/compare/v1.0.0...v1.1.0) (2026-05-29)


### Features

* initial commit ([b917162](https://github.com/OmerMohideen/react-crap/commit/b9171620d732e9002709b0e488ac2f97748e0136))
