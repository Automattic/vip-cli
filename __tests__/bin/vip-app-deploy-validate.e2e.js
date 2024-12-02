import * as exit from '../../src/lib/cli/exit';
import { validateZipFile } from '../../src/lib/validations/custom-deploy';

const exitSpy = jest.spyOn( exit, 'withError' );
jest.spyOn( process, 'exit' ).mockImplementation( () => {} );

describe( 'vip-app-deploy-validate e2e', () => {
	beforeEach( async () => {
		jest.clearAllMocks();
	} );

	describe( 'validateZipFile', () => {
		it( 'should not throw error for valid zip file', async () => {
			await validateZipFile( '__fixtures__/custom-deploy/valid-zip.zip' );

			expect( exitSpy ).not.toHaveBeenCalled();
		} );

		it.each( [
			{
				file: '__fixtures__/custom-deploy/invalid-file.zip',
				error: `Filename invalid-file-name?.txt contains disallowed characters: [!/:*?"<>|'/^..]+`,
			},
			{
				file: '__fixtures__/custom-deploy/no-root-folder.zip',
				error: `The compressed file must contain a single root directory.`,
			},
			{
				file: '__fixtures__/custom-deploy/no-themes-folder.zip',
				error: `Missing \`themes\` directory from root folder.`,
			},
		] )( 'should throw an error for invalid zip file - $file', async ( { file, error } ) => {
			await validateZipFile( file );

			expect( exitSpy ).toHaveBeenCalledWith( error );
		} );
	} );
} );
