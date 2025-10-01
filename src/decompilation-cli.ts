import DecompilationController from '@/decompilation-controller';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node decompilation-cli.js <inputPath1> [inputPath2...] <outputPath> <workspaceId> [options...]');
    process.exit(1);
  }

  // 分离选项参数（以--开头）和位置参数
  let options: string[] = [];
  let nonOptionArgs: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      options.push(arg);
      
      // 检查是否是需要值的选项（如 --wxid）
      if (arg === '--wxid' && i + 1 < args.length && !args[i + 1].startsWith('--')) {
        i++; // 跳过下一个参数
        options.push(args[i]); // 将选项的值也加入options
      }
    } else {
      nonOptionArgs.push(arg);
    }
  }
  
  if (nonOptionArgs.length < 3) {
    console.error('需要至少3个非选项参数: <inputPath1> [inputPath2...] <outputPath> <workspaceId>');
    process.exit(1);
  }
  
  // 倒数第二个非选项参数是输出路径，倒数第一个是工作区ID
  const outputPath = nonOptionArgs[nonOptionArgs.length - 2];
  const workspaceId = nonOptionArgs[nonOptionArgs.length - 1];
  
  // 前面的所有非选项参数都是输入文件路径
  const inputPaths = nonOptionArgs.slice(0, -2);
  
  if (inputPaths.length === 0) {
    console.error('至少需要提供一个输入文件路径');
    process.exit(1);
  }
  
  try {
    // 如果有多个文件，创建临时目录并复制文件
    let inputPath: string;
    
    if (inputPaths.length === 1) {
      inputPath = inputPaths[0];
    } else {
      // 多文件模式：创建临时目录
      const fs = await import('node:fs');
      const path = await import('node:path');
      const os = await import('node:os');
      
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedecode-multi-'));
      
      // 复制所有文件/目录到临时目录
      for (const filePath of inputPaths) {
        const fileName = path.basename(filePath);
        const destPath = path.join(tempDir, fileName);
        
        // 检查是文件还是目录
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          // 递归复制目录
          fs.cpSync(filePath, destPath, { recursive: true });
        } else {
          // 复制文件
          fs.copyFileSync(filePath, destPath);
        }
      }
      
      inputPath = tempDir;
    }
    
    const controller = new DecompilationController(inputPath, outputPath, workspaceId);
    
    // 解析选项
    const config = {
      usePx: options.includes('--px'),
      unpackOnly: options.includes('--unpack-only'),
      wxid: null as string | null
    };
    
    // 解析wxid参数
    const wxidIndex = options.indexOf('--wxid');
    if (wxidIndex !== -1 && wxidIndex + 1 < options.length) {
      config.wxid = options[wxidIndex + 1];
    }
    
    controller.setState(config);
    
    console.log(`开始反编译: ${inputPath}`);
    console.log(`输出目录: ${outputPath}`);
    if (workspaceId) {
      console.log(`工作区ID: ${workspaceId}`);
    }
    console.log(`配置: ${JSON.stringify(config)}`);
    
    await controller.startDecompilerProcess();
    
    console.log('反编译完成!');
    process.exit(0);
  } catch (error) {
    console.error('反编译失败:', error.message);
    process.exit(1);
  }
}

// 执行main函数
main().catch(error => {
  console.error('未处理的错误:', error);
  process.exit(1);
});