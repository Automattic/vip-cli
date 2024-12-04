import * as exit from '../../src/lib/cli/exit';
import { validateZipFile } from '../../src/lib/validations/custom-deploy';

const exitSpy = jest.spyOn( exit, 'withError' );
jest.spyOn( process, 'exit' ).mockImplementation( () => {} );
console.error = jest.fn();

describe( 'vip-app-deploy-validate e2e', () => {
	beforeEach( async () => {
		jest.clearAllMocks();
	} );

	describe( 'validateZipFile', () => {
		it.each( [
			//	Archive:  __fixtures__/custom-deploy/valid-zip-posix.zip
			//		__MACOSX/
			//		mysite/
			//		mysite/.DS_Store
			//		mysite/__MACOSX
			//		mysite/themes
			//		mysite/themes/.DS_Store
			//		mysite/themes/__MACOSX
			//		mysite/themes/mytheme.php
			'__fixtures__/custom-deploy/valid-zip-posix.zip',

			//	Archive:  __fixtures__/custom-deploy/valid-zip-win32.zip
			//		mysite/
			//		mysite/themes
			//		mysite/themes/mytheme.php
			'__fixtures__/custom-deploy/valid-zip-win32.zip',
		] )( 'should not throw error for valid zip file: %s', async file => {
			await validateZipFile( file );

			expect( exitSpy ).not.toHaveBeenCalled();
		} );

		it.each( [
			{
				//	Archive:  __fixtures__/custom-deploy/invalid-file-chars.zip
				//		mysite/
				//		mysite/themes
				//		mysite/themes/invalid-file-name?.txt
				file: '__fixtures__/custom-deploy/invalid-file-chars.zip',
				error: `Filename invalid-file-name?.txt contains disallowed characters: [!/:*?"<>|'/^..]+`,
			},
			{
				//	Archive:  __fixtures__/custom-deploy/no-root-folder.zip
				//		no-root-folder.txt
				file: '__fixtures__/custom-deploy/no-root-folder.zip',
				error: `The compressed file must contain a single root directory.`,
			},
			{
				//	Archive:  __fixtures__/custom-deploy/no-themes-folder.zip
				//		mysite/
				//		mysite/file
				file: '__fixtures__/custom-deploy/no-themes-folder.zip',
				error: `Missing \`themes\` directory from root folder.`,
			},
		] )( 'should throw an error for invalid zip file - $file', async ( { file, error } ) => {
			await validateZipFile( file );

			expect( exitSpy ).toHaveBeenCalledWith( error );
		} );
	} );
} );
