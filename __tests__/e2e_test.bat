call npm pack

echo "== Installing vip"

FOR /R "." %%f IN ( *.tgz) DO  (
    call npm i -g %%f
)

echo "== Running e2e tests"

call vip --help

rem dev-env tests

echo "== Creating dev-env"

call vip dev-env create --client-code image --title Test --multisite false --php 8.0 --wordpress 6.0 --mu-plugins image -e false -p false -x false

if NOT %errorlevel% == 0 (
    echo "== Failed to create dev-env"
    exit 1
)
