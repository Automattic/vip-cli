call npm pack

echo "== Installing vip"

FOR /R "." %%f IN ( *.tgz) DO  (
    call npm i -g %%f
)

echo "== Running e2e tests"

call vip --help

rem dev-env tests

echo "== Creating dev-env"

call vip dev-env create --app-code image --title Test --multisite false --php 8.0 --wordpress 6.0 --mu-plugins image -e false -p false -x false --mailhog false

if NOT %errorlevel% == 0 (
    echo "== Failed to create dev-env"
    exit 1
)

call ls -al C:\Users\runneradmin\.local\share\vip\dev-environment\vip-local
if NOT %errorlevel% == 0 (
    echo "== local environment folder not found"
    exit 1
)

call cat C:\Users\runneradmin\.local\share\vip\dev-environment\vip-local\.lando.yml
if NOT %errorlevel% == 0 (
    echo "== local environment lando config not found"
    exit 1
)
