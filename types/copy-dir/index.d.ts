interface CopyDir {
	sync( from: string, to: string );
}

declare const exp: CopyDir;

export default exp;
export = exp;
