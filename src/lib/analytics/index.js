export default class Analytics {
	constructor( { googleAnalytics, tracks } ) {
		if ( googleAnalytics ) {
			this.googleAnalytics = googleAnalytics;
		}

		if ( tracks ) {
			this.tracks = tracks;
		}
	}
}
