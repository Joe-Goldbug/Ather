#Requires -Version 5.1
<#
.SYNOPSIS
    Neon PostgreSQL 环境配置验证脚本 (Windows PowerShell)

.DESCRIPTION
    验证 Neon PostgreSQL 环境配置：
    - 检查环境变量是否设置
    - 验证 DATABASE_URL 格式
    - 测试数据库连接
    - 验证数据库权限

.PARAMETER Check
    仅检查，不测试连接

.PARAMETER Verbose
    显示详细输出

.PARAMETER Help
    显示帮助信息

.EXAMPLE
    .\setup-neon-env.ps1
    运行完整检查

.EXAMPLE
    .\setup-neon-env.ps1 -Check
    仅检查环境变量

.EXAMPLE
    .\setup-neon-env.ps1 -Verbose
    详细模式运行

.NOTES
    作者: DevOps Agent
    日期: 2026-04-03
    需要: PowerShell 5.1+ 或 PowerShell Core
#>

[CmdletBinding()]
param(
    [Parameter()]
    [switch]$Check,

    [Parameter()]
    [switch]$Verbose,

    [Parameter()]
    [switch]$Help
)

# 设置错误处理
$ErrorActionPreference = 'Stop'

# =============================================================================
# 颜色配置
# =============================================================================
$Colors = @{
    Info    = 'Cyan'
    Success = 'Green'
    Warning = 'Yellow'
    Error   = 'Red'
    Debug   = 'Gray'
}

# =============================================================================
# 日志函数
# =============================================================================
function Write-Log {
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [Parameter()]
        [ValidateSet('Info', 'Success', 'Warning', 'Error', 'Debug')]
        [string]$Level = 'Info'
    )

    if ($Level -eq 'Debug' -and -not $Verbose) {
        return
    }

    $prefix = switch ($Level) {
        'Info'    { '[INFO]' }
        'Success' { '[PASS]' }
        'Warning' { '[WARN]' }
        'Error'   { '[FAIL]' }
        'Debug'   { '[DEBUG]' }
    }

    Write-Host "$prefix $Message" -ForegroundColor $Colors[$Level]
}

# =============================================================================
# 帮助信息
# =============================================================================
function Show-Help {
    @"
Neon PostgreSQL 环境配置验证脚本 (Windows)

用法: .\setup-neon-env.ps1 [选项]

选项:
    -Check       仅检查，不测试连接
    -Verbose     显示详细输出
    -Help        显示此帮助信息

示例:
    .\setup-neon-env.ps1              # 运行完整检查
    .\setup-neon-env.ps1 -Check       # 仅检查环境变量
    .\setup-neon-env.ps1 -Verbose     # 详细模式

环境变量:
    DATABASE_URL      Neon PostgreSQL 连接字符串（必需）

退出代码:
    0   所有检查通过
    1   环境变量未设置
    2   DATABASE_URL 格式无效
    3   数据库连接失败
    4   数据库权限不足

安装依赖:
    1. 安装 PostgreSQL 客户端: https://www.postgresql.org/download/windows/
    2. 将 pg_dump.exe 目录添加到 PATH 环境变量
"@
}

# =============================================================================
# 检查依赖
# =============================================================================
function Test-Dependencies {
    Write-Log "检查依赖项..." -Level 'Info'

    $missingDeps = @()

    # 检查 psql
    try {
        $null = Get-Command psql -ErrorAction Stop
    } catch {
        $missingDeps += "psql (PostgreSQL client)"
    }

    if ($missingDeps.Count -gt 0) {
        Write-Log "缺少必需的依赖项:" -Level 'Error'
        foreach ($dep in $missingDeps) {
            Write-Host "  - $dep" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "安装方法:" -ForegroundColor Yellow
        Write-Host "  1. 下载 PostgreSQL: https://www.postgresql.org/download/windows/"
        Write-Host "  2. 或使用 Chocolatey: choco install postgresql"
        Write-Host "  3. 安装后将 bin 目录添加到 PATH"
        exit 1
    }

    Write-Log "所有依赖项已安装" -Level 'Success'
}

# =============================================================================
# 检查环境变量
# =============================================================================
function Test-EnvironmentVariables {
    Write-Log "检查环境变量..." -Level 'Info'

    # 检查 DATABASE_URL
    if ([string]::IsNullOrEmpty($env:DATABASE_URL)) {
        Write-Log "DATABASE_URL 环境变量未设置" -Level 'Error'
        Write-Host ""
        Write-Host "设置方法:" -ForegroundColor Yellow
        Write-Host '  [Environment]::SetEnvironmentVariable("DATABASE_URL", "postgresql://user:pass@host/db?sslmode=require", "User")'
        Write-Host ""
        Write-Host "或者创建 .env 文件:" -ForegroundColor Yellow
        Write-Host '  Add-Content -Path "backend/.env" -Value "DATABASE_URL=your-connection-string"'
        return $false
    }

    Write-Log "DATABASE_URL 已设置" -Level 'Success'
    # SECURITY: 不记录 URL 长度或任何元数据

    return $true
}

# =============================================================================
# 解析 DATABASE_URL
# =============================================================================
function Parse-DatabaseUrl {
    param([string]$Url)

    # URL 格式: postgresql://user:password@host:port/database?sslmode=require

    # 检查协议
    if (-not $Url.StartsWith('postgresql://')) {
        Write-Log "DATABASE_URL 必须以 'postgresql://' 开头" -Level 'Error'
        return $null
    }

    # 尝试匹配 URL 组件
    $pattern = '^postgresql://(?<user>[^:]+):(?<pass>[^@]*)@(?<host>[^:/]+)(:(?<port>\d+))?/(?<db>[^?]+)(\?(?<params>.*))?$'
    $match = [regex]::Match($Url, $pattern)

    if (-not $match.Success) {
        # 尝试没有密码的格式
        $pattern2 = '^postgresql://(?<user>[^@]+)@(?<host>[^:/]+)(:(?<port>\d+))?/(?<db>[^?]+)(\?(?<params>.*))?$'
        $match = [regex]::Match($Url, $pattern2)

        if (-not $match.Success) {
            Write-Log "DATABASE_URL 格式无效" -Level 'Error'
            return $null
        }
    }

    $result = @{
        Username = $match.Groups['user'].Value
        Password = $match.Groups['pass'].Value
        Host     = $match.Groups['host'].Value
        Port     = if ($match.Groups['port'].Success) { $match.Groups['port'].Value } else { '5432' }
        Database = $match.Groups['db'].Value
        Params   = if ($match.Groups['params'].Success) { $match.Groups['params'].Value } else { '' }
    }

    # 验证必需字段
    if ([string]::IsNullOrEmpty($result.Username)) {
        Write-Log "DATABASE_URL 中缺少用户名" -Level 'Error'
        return $null
    }

    if ([string]::IsNullOrEmpty($result.Host)) {
        Write-Log "DATABASE_URL 中缺少主机名" -Level 'Error'
        return $null
    }

    if ([string]::IsNullOrEmpty($result.Database)) {
        Write-Log "DATABASE_URL 中缺少数据库名" -Level 'Error'
        return $null
    }

    if ([string]::IsNullOrEmpty($result.Password)) {
        Write-Log "DATABASE_URL 中没有密码" -Level 'Warning'
    }

    # 检查 SSL
    if ($result.Params -notmatch 'sslmode=require') {
        Write-Log "建议启用 SSL: 在 URL 中添加 '?sslmode=require'" -Level 'Warning'
    } else {
        Write-Log "SSL 模式已启用" -Level 'Success'
    }

    Write-Log "解析结果:" -Level 'Debug'
    Write-Log "  用户名: $($result.Username)" -Level 'Debug'
    # SECURITY: 不显示密码长度或任何密码元数据
    Write-Log "  密码: [HIDDEN]" -Level 'Debug'
    # SECURITY: 不显示主机地址
    Write-Log "  主机: [HIDDEN]" -Level 'Debug'
    Write-Log "  端口: $($result.Port)" -Level 'Debug'
    Write-Log "  数据库: [HIDDEN]" -Level 'Debug'
    Write-Log "  参数: $($result.Params)" -Level 'Debug'

    return $result
}

# =============================================================================
# 验证 DATABASE_URL 格式
# =============================================================================
function Test-DatabaseUrlFormat {
    Write-Log "验证 DATABASE_URL 格式..." -Level 'Info'

    $script:DbConfig = Parse-DatabaseUrl -Url $env:DATABASE_URL

    if ($null -eq $script:DbConfig) {
        return $false
    }

    Write-Log "DATABASE_URL 格式有效" -Level 'Success'
    return $true
}

# =============================================================================
# 测试数据库连接
# =============================================================================
function Test-DatabaseConnection {
    Write-Log "测试数据库连接..." -Level 'Info'

    $maskedUrl = "postgresql://$($script:DbConfig.Username):****@****:$($script:DbConfig.Port)/[HIDDEN]"
    Write-Log "连接字符串: $maskedUrl" -Level 'Debug'

    $startTime = Get-Date

    try {
        # 使用 psql 测试连接
        $env:PGPASSWORD = $script:DbConfig.Password
        $result = & psql $env:DATABASE_URL -c "SELECT version();" 2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "连接失败"
        }

        $endTime = Get-Date
        $duration = [math]::Round(($endTime - $startTime).TotalMilliseconds)

        Write-Log "数据库连接成功 (耗时: ${duration}ms)" -Level 'Success'

        # 提取版本信息
        $version = ($result | Select-String -Pattern 'PostgreSQL.*') -replace '^\s+', ''
        Write-Log "PostgreSQL 版本: $version" -Level 'Info'

        return $true
    } catch {
        Write-Log "数据库连接失败" -Level 'Error'
        Write-Host ""
        Write-Host "排查建议:" -ForegroundColor Yellow
        Write-Host "  1. 检查网络连接"
        Write-Host "  2. 验证凭据是否正确"
        Write-Host "  3. 确认 Neon 项目状态: https://console.neon.tech"
        Write-Host "  4. 检查防火墙设置"
        return $false
    } finally {
        $env:PGPASSWORD = ''
    }
}

# =============================================================================
# 验证数据库权限
# =============================================================================
function Test-DatabasePermissions {
    Write-Log "验证数据库权限..." -Level 'Info'

    $errors = 0

    try {
        $env:PGPASSWORD = $script:DbConfig.Password

        # 测试 SELECT
        $null = & psql $env:DATABASE_URL -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "SELECT 权限正常" -Level 'Success'
        } else {
            Write-Log "SELECT 权限不足" -Level 'Error'
            $errors++
        }

        # 测试 CREATE TABLE
        $testTable = "test_permissions_$(Get-Random)"
        $null = & psql $env:DATABASE_URL -c "CREATE TABLE IF NOT EXISTS $testTable (id INT); DROP TABLE IF EXISTS $testTable;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "CREATE TABLE 权限正常" -Level 'Success'
        } else {
            Write-Log "CREATE TABLE 权限不足" -Level 'Error'
            $errors++
        }

        # 获取当前用户
        $currentUser = & psql $env:DATABASE_URL -t -c "SELECT current_user;" 2>&1
        $currentUser = ($currentUser | Where-Object { $_.Trim() -ne '' }).Trim()
        Write-Log "当前数据库用户: $currentUser" -Level 'Info'

        if ($errors -gt 0) {
            Write-Log "$errors 项权限检查失败" -Level 'Error'
            Write-Host ""
            Write-Host "解决方案:" -ForegroundColor Yellow
            Write-Host "  1. 在 Neon SQL Editor 中执行:"
            Write-Host "     GRANT ALL PRIVILEGES ON SCHEMA public TO $currentUser;"
            Write-Host "  2. 或者使用更高权限的用户"
            return $false
        }

        return $true
    } catch {
        Write-Log "权限检查失败: $_" -Level 'Error'
        return $false
    } finally {
        $env:PGPASSWORD = ''
    }
}

# =============================================================================
# 检查数据库表
# =============================================================================
function Get-DatabaseTables {
    Write-Log "检查数据库表..." -Level 'Info'

    try {
        $env:PGPASSWORD = $script:DbConfig.Password

        $tables = & psql $env:DATABASE_URL -t -c "
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        " 2>&1

        $tableList = $tables | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() }

        if ($tableList.Count -eq 0) {
            Write-Log "数据库中没有表" -Level 'Warning'
            Write-Host ""
            Write-Host "建议执行初始化脚本:" -ForegroundColor Yellow
            Write-Host '  psql "$env:DATABASE_URL" -f backend/db/neon_setup.sql'
        } else {
            Write-Log "发现以下表:" -Level 'Success'
            foreach ($table in $tableList) {
                Write-Host "  - $table"
            }
        }
    } catch {
        Write-Log "检查表失败: $_" -Level 'Warning'
    } finally {
        $env:PGPASSWORD = ''
    }
}

# =============================================================================
# 主函数
# =============================================================================
function Main {
    if ($Help) {
        Show-Help
        exit 0
    }

    Write-Host "=============================================================================" -ForegroundColor Cyan
    Write-Host "  Neon PostgreSQL 环境配置验证" -ForegroundColor Cyan
    Write-Host "=============================================================================" -ForegroundColor Cyan
    Write-Host ""

    # 检查依赖
    Test-Dependencies
    Write-Host ""

    # 检查环境变量
    if (-not (Test-EnvironmentVariables)) {
        exit 1
    }
    Write-Host ""

    # 验证 URL 格式
    if (-not (Test-DatabaseUrlFormat)) {
        exit 2
    }
    Write-Host ""

    # 如果仅检查模式
    if ($Check) {
        Write-Log "检查模式完成，跳过连接测试" -Level 'Info'
        exit 0
    }

    # 测试连接
    if (-not (Test-DatabaseConnection)) {
        exit 3
    }
    Write-Host ""

    # 验证权限
    if (-not (Test-DatabasePermissions)) {
        exit 4
    }
    Write-Host ""

    # 检查表
    Get-DatabaseTables
    Write-Host ""

    # 完成
    Write-Host "=============================================================================" -ForegroundColor Green
    Write-Log "所有检查通过！数据库配置正确" -Level 'Success'
    Write-Host "=============================================================================" -ForegroundColor Green

    exit 0
}

# 运行主函数
Main
