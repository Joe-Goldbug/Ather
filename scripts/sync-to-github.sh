#!/bin/bash
# EVA 自动检测更新同步脚本
# 支持：本地更改检测、远程更新拉取、智能冲突处理

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_NAME="upstream"
DEFAULT_BRANCH="main"
LOG_FILE="/tmp/eva-sync.log"
ERROR_LOG="/tmp/eva-sync-error.log"
LOCK_FILE="/tmp/eva-sync.lock"

# 自动检测当前分支或使用默认分支
get_current_branch() {
    git branch --show-current 2>/dev/null || echo "$DEFAULT_BRANCH"
}

CURRENT_BRANCH=$(get_current_branch)
REMOTE_BRANCH="$CURRENT_BRANCH"

# 监控的文件和目录
MONITORED_PATHS=(
    "docs/"
    "EVA-README.md"
    "EVA-CLAUDE.md"
    "EVA-AGENTS.md"
    "DEVELOPMENT.md"
    "README.md"
    "package.json"
    "bun.lock"
    ".gitignore"
    "apps/"
    "packages/"
    "legacy/"
    "scripts/"
)

# 日志函数
log_info() {
    local msg="[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${GREEN}${msg}${NC}"
    echo "$msg" >> "$LOG_FILE"
}

log_warn() {
    local msg="[WARN] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${YELLOW}${msg}${NC}"
    echo "$msg" >> "$LOG_FILE"
}

log_error() {
    local msg="[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${RED}${msg}${NC}"
    echo "$msg" >> "$ERROR_LOG"
    echo "$msg" >> "$LOG_FILE"
}

log_debug() {
    local msg="[DEBUG] $(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo -e "${CYAN}${msg}${NC}"
    echo "$msg" >> "$LOG_FILE"
}

# 检查是否已有同步进程在运行
check_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_warn "检测到同步进程已在运行 (PID: $pid)，跳过本次执行"
            exit 0
        else
            log_warn "检测到 stale lock 文件，清理中..."
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
    trap "rm -f $LOCK_FILE" EXIT
}

# 检查网络和 Git 状态
check_prerequisites() {
    log_info "========== 开始同步检查 =========="
    
    # 检查网络连接
    if ! ping -c 1 -W 2 github.com &>/dev/null; then
        log_error "无法连接到 GitHub，请检查网络连接"
        return 1
    fi
    
    # 检查是否在正确的目录
    cd "$PROJECT_ROOT" || {
        log_error "无法进入项目目录：$PROJECT_ROOT"
        return 1
    }
    
    # 检查是否是 git 仓库
    if ! git rev-parse --git-dir &>/dev/null; then
        log_error "当前目录不是 git 仓库"
        return 1
    fi
    
    # 检查远程仓库是否可访问
    if ! git ls-remote --exit-code "$REMOTE_NAME" &>/dev/null; then
        log_error "无法访问远程仓库 $REMOTE_NAME"
        return 1
    fi
    
    return 0
}

# 获取远程和本地的提交信息
get_commit_info() {
    local remote_sha=$(git ls-remote "$REMOTE_NAME" "$REMOTE_BRANCH" 2>/dev/null | cut -f1)
    local local_sha=$(git rev-parse "$REMOTE_BRANCH" 2>/dev/null || echo "")
    
    echo "$remote_sha $local_sha"
}

# 检测远程更新
check_remote_updates() {
    log_info "检查远程仓库更新..."
    
    git fetch "$REMOTE_NAME" "$REMOTE_BRANCH" 2>/dev/null || {
        log_warn "无法获取远程信息"
        echo "1"
        return 0
    }
    
    local remote_info=$(get_commit_info)
    local remote_sha=$(echo "$remote_info" | cut -d' ' -f1)
    local local_sha=$(echo "$remote_info" | cut -d' ' -f2)
    
    if [ -z "$remote_sha" ]; then
        log_warn "无法获取远程提交信息"
        echo "1"
        return 0
    fi
    
    if [ "$remote_sha" = "$local_sha" ]; then
        log_info "✅ 本地与远程同步"
        echo "0"
        return 0
    fi
    
    # 检查是否需要拉取
    if git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null; then
        log_info "📥 检测到远程有更新，准备拉取..."
        echo "2"
        return 0
    elif git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
        log_info "📤 本地有未推送的更新"
        echo "3"
        return 0
    else
        log_warn "⚠️  检测到分支分歧"
        echo "4"
        return 0
    fi
}

# 拉取远程更新
pull_remote_updates() {
    log_info "正在拉取远程更新..."
    
    # 先暂存本地更改
    local has_local_changes=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$has_local_changes" -gt 0 ]; then
        log_info "检测到本地有未提交更改，暂存中..."
        git stash push -m "auto-stash before pull $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || true
    fi
    
    # 拉取更新
    if git pull --rebase "$REMOTE_NAME" "$REMOTE_BRANCH" 2>/dev/null; then
        log_info "✅ 远程更新拉取成功"
        
        # 恢复本地更改
        if [ "$has_local_changes" -gt 0 ]; then
            log_info "恢复本地更改..."
            git stash pop 2>/dev/null || {
                log_warn "恢复本地更改时发生冲突，需要手动解决"
            }
        fi
        return 0
    else
        log_error "拉取远程更新失败"
        return 1
    fi
}

# 检测本地更改
check_local_changes() {
    log_info "检测本地文件更改..."
    
    local changed=0
    local added=0
    local deleted=0
    
    # 获取更改的文件列表
    local modified_files=$(git diff --name-only 2>/dev/null || true)
    local untracked_files=$(git ls-files --others --exclude-standard 2>/dev/null || true)
    local deleted_files=$(git diff --name-only --diff-filter=D 2>/dev/null || true)
    
    # 过滤监控的文件
    local files_to_sync=""
    
    for file in $modified_files; do
        for pattern in "${MONITORED_PATHS[@]}"; do
            if [[ "$file" == $pattern* ]]; then
                files_to_sync="$files_to_sync $file"
                ((changed++)) || true
                break
            fi
        done
    done
    
    for file in $untracked_files; do
        for pattern in "${MONITORED_PATHS[@]}"; do
            if [[ "$file" == $pattern* ]]; then
                files_to_sync="$files_to_sync $file"
                ((added++)) || true
                break
            fi
        done
    done
    
    if [ $changed -gt 0 ] || [ $added -gt 0 ]; then
        log_info "检测到本地更改：修改 $changed 个文件，新增 $added 个文件"
        log_debug "更改文件列表:$files_to_sync"
        return 0
    else
        log_info "✅ 本地无更改"
        return 1
    fi
}

# 提交并推送本地更改
push_local_changes() {
    log_info "提交并推送本地更改..."
    
    # 添加所有监控的文件
    for pattern in "${MONITORED_PATHS[@]}"; do
        if [ -e "$pattern" ]; then
            git add "$pattern" 2>/dev/null || true
        fi
    done
    
    # 检查是否有要提交的更改
    if ! git diff --cached --quiet 2>/dev/null; then
        local commit_msg="docs: 自动同步更新 $(date '+%Y-%m-%d %H:%M:%S')"
        
        if git commit -m "$commit_msg" 2>/dev/null; then
            log_info "✅ 提交成功：$commit_msg"
        else
            log_warn "提交失败，可能没有实际更改"
            return 1
        fi
    else
        log_info "没有需要提交的更改"
        return 0
    fi
    
    # 推送到远程
    log_info "推送到 GitHub $REMOTE_NAME/$REMOTE_BRANCH..."
    
    if git -c http.postBuffer=524288000 push "$REMOTE_NAME" "$REMOTE_BRANCH" 2>/dev/null; then
        log_info "✅ 推送成功"
        return 0
    else
        log_error "❌ 推送失败，请检查网络连接或权限"
        return 1
    fi
}

# 处理分支分歧 - 尝试自动合并
handle_divergence() {
    log_info "尝试自动处理分支分歧..."
    
    # 先暂存本地更改
    local has_local_changes=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$has_local_changes" -gt 0 ]; then
        log_info "检测到本地有未提交更改，暂存中..."
        git stash push -m "auto-stash before merge $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || true
    fi
    
    # 尝试拉取并合并
    log_info "正在拉取远程更改并尝试合并..."
    if git pull "$REMOTE_NAME" "$REMOTE_BRANCH" --no-rebase 2>/dev/null; then
        log_info "✅ 合并成功"
        
        # 恢复本地更改
        if [ "$has_local_changes" -gt 0 ]; then
            log_info "恢复本地更改..."
            git stash pop 2>/dev/null || {
                log_warn "恢复本地更改时发生冲突，需要手动解决"
            }
        fi
        return 0
    else
        log_error "自动合并失败，需要手动处理"
        return 1
    fi
}

# 显示同步状态摘要
show_summary() {
    log_info "========== 同步状态摘要 =========="
    
    # 当前分支
    local current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    log_info "当前分支：$current_branch"
    
    # 最新提交
    local latest_commit=$(git log -1 --format="%h %s" 2>/dev/null || echo "unknown")
    log_info "最新提交：$latest_commit"
    
    # 远程状态
    git fetch "$REMOTE_NAME" "$REMOTE_BRANCH" 2>/dev/null || true
    local ahead_behind=$(git rev-list --left-right --count "HEAD...$REMOTE_NAME/$REMOTE_BRANCH" 2>/dev/null || echo "0 0")
    local ahead=$(echo "$ahead_behind" | cut -f1 | tr -d ' ')
    local behind=$(echo "$ahead_behind" | cut -f2 | tr -d ' ')
    
    if [ "$ahead" != "0" ] || [ "$behind" != "0" ]; then
        if [ "$ahead" != "0" ] && [ "$behind" != "0" ]; then
            log_warn "与远程状态：领先 $ahead 个提交，落后 $behind 个提交 (有分歧)"
        elif [ "$ahead" != "0" ]; then
            log_info "与远程状态：领先 $ahead 个提交"
        else
            log_info "与远程状态：落后 $behind 个提交"
        fi
    else
        log_info "与远程状态：完全同步"
    fi
    
    # 工作区状态
    local status_short=$(git status --short 2>/dev/null | head -5)
    if [ -n "$status_short" ]; then
        log_warn "工作区有未提交的更改:"
        echo "$status_short" | while read line; do
            log_debug "  $line"
        done
    else
        log_info "工作区：干净"
    fi
    
    log_info "===================================="
}

# 主函数
main() {
    # 检查锁
    check_lock
    
    # 检查前置条件
    if ! check_prerequisites; then
        exit 1
    fi
    
    # 检查远程更新 (使用输出捕获而非返回值)
    local remote_status=$(check_remote_updates)
    
    case $remote_status in
        0)
            # 远程和本地同步，检查本地更改
            if check_local_changes; then
                push_local_changes
            fi
            ;;
        2)
            # 需要拉取远程更新
            if pull_remote_updates; then
                # 拉取后检查是否有本地更改
                if check_local_changes; then
                    push_local_changes
                fi
            fi
            ;;
        3)
            # 需要推送本地更改
            push_local_changes
            ;;
        4)
            # 有分歧，尝试自动处理
            log_warn "⚠️  检测到分支分歧"
            if handle_divergence; then
                # 合并成功后，检查是否有本地更改需要推送
                if check_local_changes; then
                    push_local_changes
                fi
            else
                log_warn "无法自动处理分歧，请手动执行以下命令："
                log_warn "  git pull $REMOTE_NAME $REMOTE_BRANCH"
                log_warn "  git push $REMOTE_NAME $REMOTE_BRANCH"
                show_summary
            fi
            ;;
        *)
            log_warn "无法确定远程状态，尝试推送本地更改"
            if check_local_changes; then
                push_local_changes || true
            fi
            ;;
    esac
    
    # 显示摘要
    show_summary
    
    log_info "========== 同步检查完成 =========="
}

# 执行主函数
main "$@"
