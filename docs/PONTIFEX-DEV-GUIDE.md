# Pontifex Dev Guide

this document is only for recording how our fork does it. for anything
else please refer to other documents in this directory.

- clone with `--depth=1` to prevent bringing in the massive amount of
  historical artifacts. we don't need git history that much because
  mostly we'll just be laying stuff above it.
- when syncing from the fork upstream (getpaseo/paseo), use "create a
  merge commit" option on github. don't rebase or squash, because
  github's "X commits ahead Y commits behind" calculator can't
  properly calculate them if we rebase/squash.
  
