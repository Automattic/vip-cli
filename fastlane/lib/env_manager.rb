# frozen_string_literal: true

# Copied from Automattic/download (fastlane/lib/env_manager.rb).
# ← infra: replace with your canonical release-toolkit version if one exists.

require 'dotenv'
require 'fastlane'

# Manages loading of environment variables from a .env and accessing them in a user-friendly way.
class EnvManager
  @env_path = nil
  @env_example_path = nil
  @print_error_lambda = nil

  def self.set_up(
    env_file_name:,
    env_file_folder: File.join(Dir.home, '.a8c-apps'),
    example_env_file_path: 'fastlane/example.env',
    print_error_lambda: ->(message) { FastlaneCore::UI.user_error!(message) }
  )
    @env_path = File.join(env_file_folder, env_file_name)
    @env_example_path = example_env_file_path
    @print_error_lambda = print_error_lambda

    Dotenv.load(@env_path)
  end

  def self.get_required_env!(key)
    unless ENV.key?(key)
      message = "Environment variable '#{key}' is not set."

      if running_on_ci?
        @print_error_lambda.call(message)
      elsif File.exist?(@env_path)
        @print_error_lambda.call("#{message} Consider adding it to #{@env_path}.")
      else
        env_file_dir = File.dirname(@env_path)
        env_file_name = File.basename(@env_path)

        @print_error_lambda.call <<~MSG
          #{env_file_name} not found in #{env_file_dir} while looking for env var #{key}.

          Please copy #{@env_example_path} to #{@env_path} and fill in the value for #{key}.

          mkdir -p #{env_file_dir} && cp #{@env_example_path} #{@env_path}
        MSG
      end
    end

    value = ENV.fetch(key)
    FastlaneCore::UI.user_error!("Env var for key #{key} is set but empty. Please set a value for #{key}.") if value.to_s.empty?
    value
  end

  def self.require_env_vars!(*keys)
    keys.each { |key| get_required_env!(key) }
  end

  def self.running_on_ci?
    ENV['CI'] == 'true'
  end
end
