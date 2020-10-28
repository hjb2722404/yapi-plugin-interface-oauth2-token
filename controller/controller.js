const yapi = require('yapi.js');
const https = require('https');
const baseController = require('controllers/base.js');
const oauthModel = require('../model/oauthModel.js');
const syncTokenUtils = require('../utils/syncTokenUtil.js');

class interfaceOauth2Controller extends baseController {
  constructor(ctx) {
    super(ctx);
    this.oauthModel = yapi.getInst(oauthModel);
    this.syncTokenUtils = yapi.getInst(syncTokenUtils);
  }

  /**
   * 保存获取token的相关信息
   * @interface /oauth_interface/save
   * @method POST
   * @returns {Object}
   * @example
   */
  async saveOauthInfo(ctx) {
    try {
      let oauthData = ctx.request.body;
      if (!oauthData.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 408, '缺少项目Id'));
      }
      if (!oauthData.env_id) {
        return (ctx.body = yapi.commons.resReturn(null, 408, '缺少环境Id'));
      }

      let existOauthData = await this.oauthModel.getByProjectIdAndEnvId(
        oauthData.project_id,
        oauthData.env_id
      );
      let result;
      if (existOauthData) {
        result = await this.oauthModel.upById(existOauthData._id, oauthData);
      } else {
        result = await this.oauthModel.save(oauthData);
      }
      //操作定时任务
      if (oauthData.is_oauth_open) {
        this.syncTokenUtils.addSyncJob(oauthData);
      } else {
        this.syncTokenUtils.deleteSyncJob(oauthData);
      }

      return (ctx.body = yapi.commons.resReturn(result));
    } catch (e) {
      return (ctx.body = yapi.commons.resReturn(null, 402, e.message));
    }
  }

  /**
   * 获取定时获取token的配置信息
   * @param {*} ctx 请求上下文
   * @method GET
   * @returns {Object}
   * @example
   */
  async getOauthInfo(ctx) {
    let projectId = ctx.query.project_id;
    let envId = ctx.query.env_id;
    if (!projectId) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少项目Id'));
    }
    if (!envId) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少环境Id'));
    }

    let result = await this.oauthModel.getByProjectIdAndEnvId(projectId, envId);
    return (ctx.body = yapi.commons.resReturn(result));
  }

  /**
   * 获取一个项目的所有token任务
   * @param {*} ctx 请求上下文
   * @method GET
   * @returns {Object}
   * @example
   */
  async getAllOauthByProjectId(ctx) {
    let projectId = ctx.query.project_id;
    if (!projectId) {
      return (ctx.body = yapi.commons.resReturn(null, 408, '缺少项目Id'));
    }

    let projectAllOauth = await this.oauthModel.getByProjectId(projectId);
    return (ctx.body = yapi.commons.resReturn(projectAllOauth));
  }

  /**
   * 校验获取token的url是否正确
   * @param {*} ctx 请求上下文
   */
  async validateTokenUrl(ctx) {
    let getTokenUrl = ctx.request.body.url;
    let type = ctx.request.body.method;
    let data_json = ctx.request.body.data_json;
    let params = {};
    ctx.request.body.params.forEach(item => {
      if (item.keyName !== '') {
        params[item.keyName] = item.value
          .trim()
          .replace('{time}', new Date().getTime());
      }
    });
    // form-data 使用k1=v1&k2=v2方式提交
    let formData = [];
    ctx.request.body.form_data.forEach(item => {
      if (item.keyName !== '') {
        formData.push(
            item.keyName + "=" + item.value.trim().replace('{time}', new Date().getTime())
        );
      }
    });
    let headersData = {};
    ctx.request.body.headers_data.forEach(item => {
      if (item.keyName !== '') {
        headersData[item.keyName] = item.value.trim().replace('{time}', new Date().getTime());
      }
    });
    // 以支持压缩的response
    headersData['Accept-Encoding'] = 'gzip, deflate';
    let dataType = ctx.request.body.dataType;
    getTokenUrl = getTokenUrl.trim().replace('{time}', new Date().getTime());
    const axios = require('axios');
    try {
      let result;
      if (type === 'GET') {
        result = await axios.get(getTokenUrl, {
          params: params,
          headers: headersData,
          httpsAgent: new https.Agent({
            rejectUnauthorized: false
          })
        });
      } else {
        if (dataType === 'data_json') {
          headersData['Content-Type'] = 'application/json';
          const instance = axios.create({
            headers: headersData,
            httpsAgent: new https.Agent({
              rejectUnauthorized: false
            })
          });
          result = await instance.post(
            getTokenUrl,
            data_json.trim().replace('{time}', new Date().getTime())
          );
        } else {
          headersData['Content-Type'] = 'application/x-www-form-urlencoded';
          result = await axios.post(getTokenUrl, formData.join('&'), {
            headers: headersData,
            httpsAgent: new https.Agent({
              rejectUnauthorized: false
            })
          });
        }
      }
      ctx.body = yapi.commons.resReturn(result.data);
      if (result.status >= 300) {
        yapi.commons.log('校验地址返回错误状态,' + result);
        ctx.body = yapi.commons.resReturn(null, 402, 'token路径错误');
      } else {
        ctx.body = yapi.commons.resReturn(result.data);
      }
    } catch (e) {
      yapi.commons.log('校验地址返回错误状态,' + e.message);
      ctx.body = yapi.commons.resReturn(null, 402, 'token路径错误');
    }
  }
}
module.exports = interfaceOauth2Controller;