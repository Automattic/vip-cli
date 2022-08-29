export const appQuery = `
	id,
	name,
	type,
	organization { id, name },
	environments{
		appId
		id
		name
		type
		softwareSettings {
			php {
			  ...Software
			}
			wordpress {
			  ...Software
			}
			muplugins {
			  ...Software
			}
			nodejs {
			  ...Software
			}
		}
	}`;

export const appQueryFragments = `fragment Software on AppEnvironmentSoftwareSettingsSoftware {
		name
		slug
		pinned
		current {
		  version
		  default
		  deprecated
		  unstable
		  compatible
		  latestRelease
		  private
		}
		options {
		  version
		  default
		  deprecated
		  unstable
		  compatible
		  latestRelease
		  private
		}
	}
`;
