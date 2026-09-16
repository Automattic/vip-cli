# frozen_string_literal: true

require 'minitest/autorun'

# Evaluate the actual Fastfile DSL without accessing credentials or Apple/S3.
module FastlaneCore
  module Helper
    def self.bundler?
      true
    end
  end
end

class SigningConfigurationTest < Minitest::Test
  def setup
    @lanes = {}
    @calls = []
    @dsl = Object.new
    lanes = @lanes
    calls = @calls
    @dsl.define_singleton_method(:before_all) { |&block| }
    @dsl.define_singleton_method(:lane) { |name, &block| lanes[name] = block }
    @dsl.define_singleton_method(:sync_code_signing) do |**options|
      calls << options
      raise 'Installer certificate unavailable' if options[:type] == 'developer_id_installer' || options[:additional_cert_types]
    end
    @dsl.instance_eval(File.read(File.join(__dir__, 'Fastfile')), File.join(__dir__, 'Fastfile'))
    @dsl.define_singleton_method(:require_env_vars!) { |*names| }
  end

  def test_missing_installer_identity_does_not_affect_application_lane
    @lanes.fetch(:configure_code_signing).call
    assert_equal 'developer_id', @calls.last[:type]
    assert_equal true, @calls.last[:readonly]
    assert_nil @calls.last[:additional_cert_types]
    error = assert_raises(RuntimeError) { @lanes.fetch(:configure_installer_signing).call }
    assert_equal 'Installer certificate unavailable', error.message
    assert_equal true, @calls.last[:readonly]
    assert_equal true, @calls.last[:skip_provisioning_profiles]
    @lanes.fetch(:configure_code_signing).call
  end

  # Match's top-level `developer_id_installer` type silently resolves to an Apple Distribution
  # certificate, so the supported route is pinned rather than left to preference.
  def test_installer_lane_requests_the_installer_certificate_as_an_additional_type
    assert_raises(RuntimeError) { @lanes.fetch(:configure_installer_signing).call }

    assert_equal 'developer_id', @calls.last[:type]
    assert_equal ['developer_id_installer'], @calls.last[:additional_cert_types]
  end

  def test_installer_lane_never_creates_certificates
    assert_raises(RuntimeError) { @lanes.fetch(:configure_installer_signing).call }

    assert_equal true, @calls.last[:readonly]
    assert_nil @calls.last[:api_key]
  end
end
