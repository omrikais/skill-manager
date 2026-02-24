import { UsageError } from '../utils/errors.js';

const SUBCOMMANDS = 'import list add remove sync info doctor create edit search convert init install profile backup restore backups history rollback suggest completion hooks analytics source pack publish mcp generate';

export function completionCommand(shell: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'bash':
      return bashCompletion();
    case 'zsh':
      return zshCompletion();
    case 'fish':
      return fishCompletion();
    default:
      throw new UsageError(`Unsupported shell: "${shell}". Supported: bash, zsh, fish`);
  }
}

function bashCompletion(): string {
  return `# bash completion for sm
_sm_completions() {
  local cur prev subcmds sm_home
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  subcmds="${SUBCOMMANDS}"
  sm_home="\${SM_HOME:-$HOME/.skill-manager}"

  local topcmd="\${COMP_WORDS[1]}"

  case "\${prev}" in
    add|remove|rm|info|edit|convert|create|history|rollback|publish)
      case "\${topcmd}" in
        source|pack|profile|hooks|mcp|generate) ;;
        *)
          local skills
          skills=$(ls "\${sm_home}/skills/" 2>/dev/null)
          COMPREPLY=( $(compgen -W "\${skills}" -- "\${cur}") )
          return 0
          ;;
      esac
      ;;
    profile)
      COMPREPLY=( $(compgen -W "list create apply delete" -- "\${cur}") )
      return 0
      ;;
    apply|delete)
      if [[ "\${COMP_WORDS[1]}" == "profile" ]]; then
        local profiles
        profiles=$(ls "\${sm_home}/profiles/" 2>/dev/null | sed 's/\\.json$//')
        COMPREPLY=( $(compgen -W "\${profiles}" -- "\${cur}") )
        return 0
      fi
      ;;
    --from)
      COMPREPLY=( $(compgen -W "all cc codex" -- "\${cur}") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
    hooks)
      COMPREPLY=( $(compgen -W "setup run" -- "\${cur}") )
      return 0
      ;;
    analytics)
      COMPREPLY=( $(compgen -W "--json" -- "\${cur}") )
      return 0
      ;;
    source)
      COMPREPLY=( $(compgen -W "add list sync remove" -- "\${cur}") )
      return 0
      ;;
    pack)
      COMPREPLY=( $(compgen -W "list install" -- "\${cur}") )
      return 0
      ;;
    mcp)
      COMPREPLY=( $(compgen -W "setup uninstall" -- "\${cur}") )
      return 0
      ;;
    generate)
      COMPREPLY=( $(compgen -W "claude-md agents-md both" -- "\${cur}") )
      return 0
      ;;
  esac

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${subcmds}" -- "\${cur}") )
  fi
}
complete -F _sm_completions sm
`;
}

function zshCompletion(): string {
  return `#compdef sm

_sm() {
  local -a subcmds
  local sm_home="\${SM_HOME:-$HOME/.skill-manager}"
  subcmds=(
    'import:Import existing skills from CC and Codex'
    'list:List all managed skills'
    'add:Deploy a skill to tool(s)'
    'remove:Undeploy a skill from tool(s)'
    'sync:Validate and optionally repair all symlinks'
    'info:Show detailed info about a skill'
    'doctor:Run health checks'
    'create:Create a new skill from template'
    'edit:Open a skill in \\$EDITOR'
    'search:Search skills by name, description, or tags'
    'convert:Convert a legacy skill to new format'
    'init:Create a .skills.json project manifest'
    'install:Install skills from URL, repo, or manifest'
    'profile:Manage skill profiles'
    'backup:Create a backup'
    'restore:Restore from a backup'
    'backups:List available backups'
    'history:Show version history for a skill'
    'rollback:Restore a skill to a previous version'
    'suggest:Suggest skills for current project'
    'completion:Output shell completion script'
    'hooks:Manage Claude Code session hooks'
    'analytics:Show skill usage analytics'
    'source:Manage remote skill repositories'
    'pack:Install curated skill packs'
    'publish:Export a skill to a portable directory'
    'mcp:MCP server for AI tool integration'
    'generate:Generate project-aware CLAUDE.md / AGENTS.md'
  )

  _arguments -C \\
    '1: :->subcmd' \\
    '*:: :->args'

  case \$state in
    subcmd)
      _describe 'command' subcmds
      ;;
    args)
      case \$words[1] in
        add)
          _arguments '--cc[Deploy to Claude Code]' '--codex[Deploy to Codex CLI]' '--all[Deploy to all tools]' '--no-deps[Skip dependency auto-deploy]' '--project[Deploy to current project directory]' '*:skill:(\${(f)"$(ls "\${sm_home}/skills/" 2>/dev/null)"})'
          ;;
        remove|rm)
          _arguments '--cc[Remove from Claude Code]' '--codex[Remove from Codex CLI]' '--purge[Also delete from canonical store]' '--force[Skip dependent safety check]' '--project[Remove from current project directory]' '*:skill:(\${(f)"$(ls "\${sm_home}/skills/" 2>/dev/null)"})'
          ;;
        list|ls)
          _arguments '--cc[Show only CC-deployed skills]' '--codex[Show only Codex-deployed skills]' '--status[Show detailed status information]' '--project[Show project-scoped deployments]'
          ;;
        info|edit|convert|create|history|rollback|publish)
          local -a skills
          skills=(\${(f)"$(ls "\${sm_home}/skills/" 2>/dev/null)"})
          _describe 'skill' skills
          ;;
        profile)
          if (( CURRENT == 2 )); then
            local -a actions
            actions=('list' 'create' 'apply' 'delete')
            _describe 'action' actions
          elif (( CURRENT == 3 )); then
            case \$words[2] in
              apply|delete)
                local -a profiles
                profiles=(\${(f)"$(ls "\${sm_home}/profiles/" 2>/dev/null | sed 's/\\.json$//')"})
                _describe 'profile' profiles
                ;;
            esac
          fi
          ;;
        completion)
          _describe 'shell' '(bash zsh fish)'
          ;;
        import)
          _arguments '--from[Source]:source:(all cc codex)' '--dry-run[Show what would be imported]'
          ;;
        suggest)
          _arguments '--apply[Auto-deploy matching skills]' '--json[Output as JSON]'
          ;;
        hooks)
          if (( CURRENT == 2 )); then
            local -a actions
            actions=('setup' 'run')
            _describe 'action' actions
          fi
          ;;
        analytics)
          _arguments '--json[Output as JSON]'
          ;;
        source)
          if (( CURRENT == 2 )); then
            local -a actions
            actions=('add' 'list' 'sync' 'remove')
            _describe 'action' actions
          fi
          ;;
        pack)
          if (( CURRENT == 2 )); then
            local -a actions
            actions=('list' 'install')
            _describe 'action' actions
          fi
          ;;
        mcp)
          if (( CURRENT == 2 )); then
            local -a actions
            actions=('setup' 'uninstall')
            _describe 'action' actions
          fi
          ;;
        generate)
          if (( CURRENT == 2 )); then
            local -a actions
            actions=('claude-md' 'agents-md' 'both')
            _describe 'action' actions
          fi
          ;;
      esac
      ;;
  esac
}

_sm "\$@"
`;
}

function fishCompletion(): string {
  return `# fish completion for sm
complete -c sm -f

# Resolve SM_HOME
set -q SM_HOME; and set -l sm_home $SM_HOME; or set -l sm_home $HOME/.skill-manager

# Subcommands
complete -c sm -n '__fish_use_subcommand' -a 'import' -d 'Import existing skills from CC and Codex'
complete -c sm -n '__fish_use_subcommand' -a 'list' -d 'List all managed skills'
complete -c sm -n '__fish_use_subcommand' -a 'add' -d 'Deploy a skill to tool(s)'
complete -c sm -n '__fish_use_subcommand' -a 'remove' -d 'Undeploy a skill from tool(s)'
complete -c sm -n '__fish_use_subcommand' -a 'sync' -d 'Validate and repair symlinks'
complete -c sm -n '__fish_use_subcommand' -a 'info' -d 'Show detailed info about a skill'
complete -c sm -n '__fish_use_subcommand' -a 'doctor' -d 'Run health checks'
complete -c sm -n '__fish_use_subcommand' -a 'create' -d 'Create a new skill from template'
complete -c sm -n '__fish_use_subcommand' -a 'edit' -d 'Open a skill in \\$EDITOR'
complete -c sm -n '__fish_use_subcommand' -a 'search' -d 'Search skills'
complete -c sm -n '__fish_use_subcommand' -a 'convert' -d 'Convert a legacy skill'
complete -c sm -n '__fish_use_subcommand' -a 'init' -d 'Create project manifest'
complete -c sm -n '__fish_use_subcommand' -a 'install' -d 'Install skills from URL, repo, or manifest'
complete -c sm -n '__fish_use_subcommand' -a 'profile' -d 'Manage profiles'
complete -c sm -n '__fish_use_subcommand' -a 'backup' -d 'Create a backup'
complete -c sm -n '__fish_use_subcommand' -a 'restore' -d 'Restore from a backup'
complete -c sm -n '__fish_use_subcommand' -a 'backups' -d 'List backups'
complete -c sm -n '__fish_use_subcommand' -a 'history' -d 'Show version history'
complete -c sm -n '__fish_use_subcommand' -a 'rollback' -d 'Restore a previous version'
complete -c sm -n '__fish_use_subcommand' -a 'suggest' -d 'Suggest skills for current project'
complete -c sm -n '__fish_use_subcommand' -a 'completion' -d 'Output shell completion script'
complete -c sm -n '__fish_use_subcommand' -a 'hooks' -d 'Manage Claude Code session hooks'
complete -c sm -n '__fish_use_subcommand' -a 'analytics' -d 'Show skill usage analytics'
complete -c sm -n '__fish_use_subcommand' -a 'source' -d 'Manage remote skill repositories'
complete -c sm -n '__fish_use_subcommand' -a 'pack' -d 'Install curated skill packs'
complete -c sm -n '__fish_use_subcommand' -a 'publish' -d 'Export a skill to a portable directory'
complete -c sm -n '__fish_use_subcommand' -a 'mcp' -d 'MCP server for AI tool integration'
complete -c sm -n '__fish_use_subcommand' -a 'generate' -d 'Generate project-aware CLAUDE.md / AGENTS.md'

# Skill name completions for relevant subcommands
for cmd in add remove info edit convert create history rollback publish
  complete -c sm -n "__fish_seen_subcommand_from $cmd" -a "(ls $sm_home/skills/ 2>/dev/null)"
end

# Profile subcommand actions
complete -c sm -n '__fish_seen_subcommand_from profile; and not __fish_seen_subcommand_from list create apply delete' -a 'list create apply delete'

# Profile name completions for apply/delete
complete -c sm -n '__fish_seen_subcommand_from profile; and __fish_seen_subcommand_from apply delete' -a "(ls $sm_home/profiles/ 2>/dev/null | string replace -r '\\.json\$' '')"

# Import options
complete -c sm -n '__fish_seen_subcommand_from import' -l from -a 'all cc codex'
complete -c sm -n '__fish_seen_subcommand_from import' -l dry-run -d 'Show what would be imported'

# Suggest options
complete -c sm -n '__fish_seen_subcommand_from suggest' -l apply -d 'Auto-deploy matching skills'
complete -c sm -n '__fish_seen_subcommand_from suggest' -l json -d 'Output as JSON'

# Add options
complete -c sm -n '__fish_seen_subcommand_from add' -l no-deps -d 'Skip dependency auto-deploy'
complete -c sm -n '__fish_seen_subcommand_from add' -l project -d 'Deploy to current project directory'

# Remove options
complete -c sm -n '__fish_seen_subcommand_from remove' -l force -d 'Skip dependent safety check'
complete -c sm -n '__fish_seen_subcommand_from remove' -l project -d 'Remove from current project directory'

# List options
complete -c sm -n '__fish_seen_subcommand_from list' -l cc -d 'Show only CC-deployed skills'
complete -c sm -n '__fish_seen_subcommand_from list' -l codex -d 'Show only Codex-deployed skills'
complete -c sm -n '__fish_seen_subcommand_from list' -l status -d 'Show detailed status information'
complete -c sm -n '__fish_seen_subcommand_from list' -l project -d 'Show project-scoped deployments'

# Hooks subcommand actions
complete -c sm -n '__fish_seen_subcommand_from hooks; and not __fish_seen_subcommand_from setup run' -a 'setup run'

# Hooks setup options
complete -c sm -n '__fish_seen_subcommand_from hooks; and __fish_seen_subcommand_from setup' -l project -d 'Write to project settings'

# Analytics options
complete -c sm -n '__fish_seen_subcommand_from analytics' -l json -d 'Output as JSON'

# Completion shell options
complete -c sm -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'

# Source subcommand actions
complete -c sm -n '__fish_seen_subcommand_from source; and not __fish_seen_subcommand_from add list sync remove' -a 'add list sync remove'

# Source remove options
complete -c sm -n '__fish_seen_subcommand_from source; and __fish_seen_subcommand_from remove' -l purge -d 'Also delete cloned repo'

# Pack subcommand actions
complete -c sm -n '__fish_seen_subcommand_from pack; and not __fish_seen_subcommand_from list install' -a 'list install'

# Pack install options
complete -c sm -n '__fish_seen_subcommand_from pack; and __fish_seen_subcommand_from install' -l dry-run -d 'Show what would be installed'

# MCP subcommand actions
complete -c sm -n '__fish_seen_subcommand_from mcp; and not __fish_seen_subcommand_from setup uninstall' -a 'setup uninstall'

# MCP setup/uninstall options
complete -c sm -n '__fish_seen_subcommand_from mcp; and __fish_seen_subcommand_from setup uninstall' -l tool -a 'cc codex all'
complete -c sm -n '__fish_seen_subcommand_from mcp; and __fish_seen_subcommand_from setup uninstall' -l scope -a 'local project user'

# Generate subcommand actions
complete -c sm -n '__fish_seen_subcommand_from generate; and not __fish_seen_subcommand_from claude-md agents-md both' -a 'claude-md agents-md both'

# Publish options
complete -c sm -n '__fish_seen_subcommand_from publish' -l out -d 'Output directory'
complete -c sm -n '__fish_seen_subcommand_from publish' -l overwrite -d 'Overwrite if target exists'
`;
}
