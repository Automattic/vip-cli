# Jest syntax preset adapter

Jest uses this adapter to load the upstream syntax preset with its Babel 7
syntax-plugin peer dependencies isolated from the project's Babel 8 core.
The adapter re-exports the upstream preset without changing its behavior.
