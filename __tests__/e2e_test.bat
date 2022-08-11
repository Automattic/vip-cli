
@REM call DockerCli -SwitchLinuxEngine
call docker version
call where docker
@REM call dir "C:\Program Files\Docker"
call where docker-compose

@REM call dir \s DockerCli.exe
C:
call dir \s DockerCli.exe
@REM call dir "C:\ProgramData\Chocolatey"

@REM call cat "C:\ProgramData\Docker\config\daemon.json"

@REM call Install-WindowsFeature -Name Hyper-V -IncludeManagementTools -Restart
call Install-Module -Name DockerMsftProvider -Repository PSGallery -Force
call Get-PackageProvider -ListAvailableget-packagesource -ProviderName DockerMsftProvider

call wsl -l -o

call wsl --status

call systeminfo

call docker pull ubuntu

@REM call npm pack

@REM echo "== Installing vip"

@REM FOR /R "." %%f IN ( *.tgz) DO  (
@REM     call npm i -g %%f
@REM )

@REM echo "== Running e2e tests"

@REM call vip --help

@REM rem dev-env tests

@REM echo "== Creating dev-env"

@REM call vip dev-env create --client-code image --title Test --multisite false --php 8.0 --wordpress 6.0 --mu-plugins image -e false -p false -x false

@REM if NOT %errorlevel% == 0 (
@REM     echo "== Failed to create dev-env"
@REM     exit 1
@REM )

@REM echo "== Starting dev-env"

@REM call vip dev-env start --skip-wp-versions-check

@REM if NOT %errorlevel% == 0 (
@REM     echo "== Dev-env failed to start"
@REM     exit 1
@REM )